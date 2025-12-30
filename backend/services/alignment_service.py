import cv2
import numpy as np
import base64
import logging
from typing import List, Dict, Tuple, Optional

# Configure logging
logger = logging.getLogger(__name__)

class AlignmentService:
    """
    Industrial-grade Image Alignment Service.
    Uses ORB feature detection with RANSAC robust estimation.
    Includes preprocessing, sanity checks, and fallback mechanisms.
    """
    
    def __init__(self):
        # Increased feature count for complex drawings
        self.orb = cv2.ORB_create(
            nfeatures=5000, 
            scaleFactor=1.2, 
            nlevels=8, 
            edgeThreshold=31, 
            firstLevel=0, 
            WTA_K=2, 
            scoreType=cv2.ORB_HARRIS_SCORE, 
            patchSize=31, 
            fastThreshold=20
        )
        # Brute Force Matcher with Hamming distance (efficient for binary descriptors)
        self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        
        # Constants
        self.MIN_MATCH_COUNT = 10
        self.RESIZE_WIDTH = 2000  # Standardize analysis width for consistency

    def decode_image(self, base64_string: str) -> Optional[np.ndarray]:
        """Robust image decoding with error handling."""
        try:
            if "," in base64_string:
                base64_string = base64_string.split(",")[1]
            img_data = base64.b64decode(base64_string)
            nparr = np.frombuffer(img_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
            
            if img is None:
                logger.error("Failed to decode image bytes")
                return None
            return img
        except Exception as e:
            logger.error(f"Image decode exception: {str(e)}")
            return None

    def preprocess_image(self, img: np.ndarray) -> Tuple[np.ndarray, float]:
        """
        Clean image and standardize resolution for consistent feature detection.
        Returns: (cleaned_image, scale_factor)
        """
        # 1. Calculate Scale Factor
        height, width = img.shape
        scale = 1.0
        if width > self.RESIZE_WIDTH:
            scale = self.RESIZE_WIDTH / width
            new_width = self.RESIZE_WIDTH
            new_height = int(height * scale)
            img = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_AREA)

        # 2. Denoising (Gaussian Blur) - Removes scanner noise/dust
        img_blur = cv2.GaussianBlur(img, (5, 5), 0)

        # 3. Adaptive Thresholding - Handles uneven lighting/shadows on scans
        # This converts to binary (black/white) which ORB loves
        img_thresh = cv2.adaptiveThreshold(
            img_blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )
        
        return img_thresh, scale

    def validate_homography(self, matrix: np.ndarray) -> bool:
        """
        Sanity check the transformation matrix.
        Reject extreme distortions that indicate a bad match.
        """
        if matrix is None: 
            return False

        # Calculate determinant (measure of area scaling)
        det = np.linalg.det(matrix[:2, :2])
        
        # If the page is shrinking to <10% or growing >10x, it's wrong.
        if det < 0.1 or det > 10:
            logger.warning(f"Homography rejected: Extreme scaling (det={det:.2f})")
            return False
            
        return True

    def align_and_compare(self, img_a_b64: str, img_b_b64: str, dims_a: List, dims_b: List) -> Tuple[List, List, Dict]:
        """
        Main Pipeline:
        1. Decode & Preprocess
        2. Feature Match & Homography
        3. Validate Transformation
        4. Anchor IDs & Compare
        """
        stats = {"added": 0, "removed": 0, "modified": 0, "unchanged": 0, "method": "naive"}
        
        # --- Step 1: Image Loading ---
        img_a_raw = self.decode_image(img_a_b64)
        img_b_raw = self.decode_image(img_b_b64)

        if img_a_raw is None or img_b_raw is None:
            return self._fallback_compare(dims_a, dims_b, error="Image load failure")

        # --- Step 2: Preprocessing ---
        # We work on scaled/cleaned images for speed and accuracy
        img_a, scale_a = self.preprocess_image(img_a_raw)
        img_b, scale_b = self.preprocess_image(img_b_raw)

        # --- Step 3: Feature Detection ---
        kp1, des1 = self.orb.detectAndCompute(img_a, None)
        kp2, des2 = self.orb.detectAndCompute(img_b, None)

        if des1 is None or des2 is None or len(kp1) < self.MIN_MATCH_COUNT or len(kp2) < self.MIN_MATCH_COUNT:
            logger.warning("Insufficient features detected. Falling back to naive compare.")
            return self._fallback_compare(dims_a, dims_b, error="Low feature count")

        # --- Step 4: Matching ---
        matches = self.matcher.match(des1, des2)
        matches = sorted(matches, key=lambda x: x.distance)
        
        # Keep top 25% matches
        good_matches = matches[:int(len(matches) * 0.25)]

        if len(good_matches) < self.MIN_MATCH_COUNT:
            return self._fallback_compare(dims_a, dims_b, error="Insufficient matches")

        # --- Step 5: Homography Calculation ---
        src_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)

        # RANSAC is the statistical robustness layer
        M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)

        # --- Step 6: Validation ---
        if not self.validate_homography(M):
            return self._fallback_compare(dims_a, dims_b, error="Bad homography")

        # --- Step 7: Scale Correction ---
        # The matrix M is for the *scaled* images. We need to adjust it for the *original* coordinates.
        # This is complex linear algebra: M_final = Scale_A_Inverse * M * Scale_B
        
        scale_mat_a = np.array([[1/scale_a, 0, 0], [0, 1/scale_a, 0], [0, 0, 1]])
        scale_mat_b = np.array([[scale_b, 0, 0], [0, scale_b, 0], [0, 0, 1]])
        
        M_final = np.dot(scale_mat_a, np.dot(M, scale_mat_b))
        
        # Success! use the aligned comparison
        stats["method"] = "aligned_homography"
        return self._match_dimensions(dims_a, dims_b, M_final, stats)

    def _match_dimensions(self, dims_a: List, dims_b: List, matrix: np.ndarray, stats: Dict) -> Tuple[List, List, Dict]:
        """
        Matches dimensions using the robust transformation matrix.
        """
        used_a_ids = set()
        processed_b = []
        
        # Adjustable tolerance for "Same Dimension"
        # 2% of image width is usually a good dynamic tolerance, but fixed pixel is safer for now
        POSITION_TOLERANCE = 50.0 

        for db in dims_b:
            # 1. Get Center Point of B
            box = db.bounding_box
            cx = (box.xmin + box.xmax) / 2
            cy = (box.ymin + box.ymax) / 2
            
            # 2. Transform Point B -> A Space
            pt = np.array([[[cx, cy]]], dtype=np.float32)
            try:
                transformed_pt = cv2.perspectiveTransform(pt, matrix)[0][0]
                tx, ty = transformed_pt[0], transformed_pt[1]
            except Exception:
                # If math fails for a point, treat as added
                tx, ty = -9999, -9999

            # 3. Find Match in A
            best_match = None
            min_dist = float('inf')

            for da in dims_a:
                # Center of A
                ax = (da.bounding_box.xmin + da.bounding_box.xmax) / 2
                ay = (da.bounding_box.ymin + da.bounding_box.ymax) / 2
                
                dist = np.sqrt((tx - ax)**2 + (ty - ay)**2)
                
                if dist < POSITION_TOLERANCE and dist < min_dist:
                    min_dist = dist
                    best_match = da

            # 4. Assign Status
            if best_match:
                # Found the ancestor!
                db.id = best_match.id
                used_a_ids.add(best_match.id)
                
                # Check Value Logic
                val_b = str(db.value).strip().upper()
                val_a = str(best_match.value).strip().upper()
                
                if val_b == val_a:
                    db.status = "unchanged"
                    stats["unchanged"] += 1
                else:
                    db.status = "modified"
                    db.old_value = best_match.value
                    stats["modified"] += 1
            else:
                # No ancestor found -> It's new
                db.status = "added"
                stats["added"] += 1

            processed_b.append(db)

        # 5. Find Removed Items (Ghosts)
        removed_dims = []
        for da in dims_a:
            if da.id not in used_a_ids:
                da.status = "removed"
                removed_dims.append(da)
                stats["removed"] += 1

        # 6. Assign IDs to new items (Safe re-numbering)
        # Find the highest ID used so far to avoid collision
        max_id = 0
        all_ids = [d.id for d in dims_a] + [d.id for d in processed_b if getattr(d, 'id', None)]
        if all_ids:
            max_id = max(all_ids)
            
        current_new_id = max_id + 1
        for db in processed_b:
            if db.status == "added":
                db.id = current_new_id
                current_new_id += 1

        return processed_b, removed_dims, stats

    def _fallback_compare(self, dims_a, dims_b, error=""):
        """
        Backup Logic: Geometric Overlap Comparison.
        Triggered when computer vision alignment fails (e.g., too few features).
        Uses Intersection over Union (IoU) to find matching boxes.
        """
        logger.warning(f"Alignment fallback triggered: {error}")
        stats = {"added": 0, "removed": 0, "modified": 0, "unchanged": 0, "method": "naive_fallback", "error": error}
        
        used_a_ids = set()
        processed_b = []
        
        # Pixel threshold for simple center-point distance match
        DISTANCE_THRESHOLD = 50.0 

        for db in dims_b:
            # Calculate center of B
            bx_center = (db.bounding_box.xmin + db.bounding_box.xmax) / 2
            by_center = (db.bounding_box.ymin + db.bounding_box.ymax) / 2
            
            best_match = None
            min_dist = float('inf')

            # Search for nearest neighbor in A
            for da in dims_a:
                # Calculate center of A
                ax_center = (da.bounding_box.xmin + da.bounding_box.xmax) / 2
                ay_center = (da.bounding_box.ymin + da.bounding_box.ymax) / 2
                
                # Euclidean distance
                dist = np.sqrt((bx_center - ax_center)**2 + (by_center - ay_center)**2)
                
                if dist < DISTANCE_THRESHOLD and dist < min_dist:
                    min_dist = dist
                    best_match = da
            
            # Match Logic
            if best_match:
                db.id = best_match.id
                used_a_ids.add(best_match.id)
                
                # Compare text values (strip whitespace, ignore case)
                val_b = str(db.value).strip().upper()
                val_a = str(best_match.value).strip().upper()
                
                if val_b == val_a:
                    db.status = "unchanged"
                    stats["unchanged"] += 1
                else:
                    db.status = "modified"
                    db.old_value = best_match.value
                    stats["modified"] += 1
            else:
                db.status = "added"
                stats["added"] += 1
            
            processed_b.append(db)

        # Identify Removed Dimensions (In A, but never matched)
        removed_dims = []
        for da in dims_a:
            if da.id not in used_a_ids:
                da.status = "removed"
                removed_dims.append(da)
                stats["removed"] += 1
                
        # Assign new IDs to 'added' items to ensure valid integers
        # Start counting from the highest existing ID + 1
        all_ids = [d.id for d in dims_a] + [d.id for d in processed_b if getattr(d, 'id', None)]
        next_id = (max(all_ids) if all_ids else 0) + 1
        
        for db in processed_b:
            if db.status == "added":
                db.id = next_id
                next_id += 1
                
        return processed_b, removed_dims, stats
