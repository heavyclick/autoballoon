import cv2
import numpy as np
import base64
import logging
import hashlib
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
        # Result: Background = 255 (White), Text = 0 (Black)
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

    def _transform_point(self, point: Tuple[float, float], matrix: np.ndarray) -> Tuple[float, float]:
        """Helper to transform a single point (x, y) using a homography matrix."""
        pt = np.array([[[point[0], point[1]]]], dtype=np.float32)
        try:
            transformed_pt = cv2.perspectiveTransform(pt, matrix)[0][0]
            return float(transformed_pt[0]), float(transformed_pt[1])
        except Exception:
            # Return a far-off point to indicate failure without crashing
            return -9999.0, -9999.0

    def port_balloons(self, img_a_b64: str, img_b_b64: str, balloons_a: List) -> Tuple[List, Dict]:
        """
        Port balloons from Revision A (old) to Revision B (new).
        Calculates A -> B transformation and updates coordinates.
        Checks if ported balloons land on "ink" (features) in the new drawing.
        """
        stats = {"ported": 0, "dropped": 0, "method": "feature_alignment"}
        
        # --- Step 1: Decode ---
        img_a_raw = self.decode_image(img_a_b64)
        img_b_raw = self.decode_image(img_b_b64)
        
        if img_a_raw is None or img_b_raw is None:
            logger.error("Porting failed: Could not decode images")
            return [], {"error": "Image decode failure"}

        # --- Step 2: Preprocess ---
        img_a, scale_a = self.preprocess_image(img_a_raw)
        img_b, scale_b = self.preprocess_image(img_b_raw)

        # --- Step 3: Features & Matching ---
        kp1, des1 = self.orb.detectAndCompute(img_a, None)
        kp2, des2 = self.orb.detectAndCompute(img_b, None)

        if des1 is None or des2 is None or len(kp1) < self.MIN_MATCH_COUNT or len(kp2) < self.MIN_MATCH_COUNT:
            logger.warning("Porting failed: Insufficient features")
            return [], {"error": "Insufficient features to align drawings"}

        matches = self.matcher.match(des1, des2)
        matches = sorted(matches, key=lambda x: x.distance)
        good_matches = matches[:int(len(matches) * 0.25)]

        if len(good_matches) < self.MIN_MATCH_COUNT:
             return [], {"error": "Insufficient matches between revisions"}

        # --- Step 4: Homography A -> B ---
        # Query (1) = A, Train (2) = B
        # We want Map A -> B
        src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

        M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)

        if not self.validate_homography(M):
            return [], {"error": "Alignment failed (bad homography)"}

        # --- Step 5: Scale Correction ---
        # Map: (A_orig * s_a) -> M -> (B_orig * s_b)
        # B_orig = (1/s_b) * M * s_a * A_orig
        scale_mat_a = np.array([[scale_a, 0, 0], [0, scale_a, 0], [0, 0, 1]])
        scale_mat_b_inv = np.array([[1/scale_b, 0, 0], [0, 1/scale_b, 0], [0, 0, 1]])
        
        M_final = np.dot(scale_mat_b_inv, np.dot(M, scale_mat_a))

        # --- Step 6: Port Balloons ---
        ported_balloons = []
        
        for balloon in balloons_a:
            # Handle both Pydantic models and dicts
            try:
                if isinstance(balloon, dict):
                     box = balloon.get('bounding_box')
                     b_id = balloon.get('id')
                     b_val = balloon.get('value', '')
                else:
                     box = balloon.bounding_box
                     b_id = balloon.id
                     b_val = getattr(balloon, 'value', '')
                     
                # Handle box as dict or object
                if isinstance(box, dict):
                    xmin, ymin, xmax, ymax = box['xmin'], box['ymin'], box['xmax'], box['ymax']
                else:
                    xmin, ymin, xmax, ymax = box.xmin, box.ymin, box.xmax, box.ymax
            except (AttributeError, KeyError):
                continue # Skip invalid items

            # Calculate Center
            cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
            w, h = xmax - xmin, ymax - ymin

            # Transform Center
            new_cx, new_cy = self._transform_point((cx, cy), M_final)

            # Check if off-page (negative coords)
            if new_cx < 0 or new_cy < 0:
                stats["dropped"] += 1
                continue

            # --- Ink Check ---
            # Map new center to processed image B coordinates for pixel checking
            chk_x = int(new_cx * scale_b)
            chk_y = int(new_cy * scale_b)
            
            # Check window size (approx 20px or scaled width)
            chk_w = max(5, int(w * scale_b))
            chk_h = max(5, int(h * scale_b))
            
            x1_c = max(0, chk_x - chk_w // 2)
            y1_c = max(0, chk_y - chk_h // 2)
            x2_c = min(img_b.shape[1], chk_x + chk_w // 2)
            y2_c = min(img_b.shape[0], chk_y + chk_h // 2)
            
            # Extract ROI
            roi = img_b[y1_c:y2_c, x1_c:x2_c]
            
            # Count black pixels (Ink). Adaptive thresholding makes ink 0.
            # Assuming ink is < 128
            if roi.size > 0:
                ink_pixels = np.count_nonzero(roi < 128)
                ink_ratio = ink_pixels / roi.size
            else:
                ink_ratio = 0
            
            # Heuristic: If > 1% ink, we assume it landed on something
            has_feature = ink_ratio > 0.01 
            
            # Update Coordinates
            new_box = {
                "xmin": new_cx - w/2,
                "xmax": new_cx + w/2,
                "ymin": new_cy - h/2,
                "ymax": new_cy + h/2
            }
            
            # Create ported item dict
            ported_item = {
                "id": b_id,
                "old_id": b_id,
                "value": b_val,
                "bounding_box": new_box,
                "status": "ported" if has_feature else "detached",
                "alignment_score": round(ink_ratio, 3)
            }
            
            ported_balloons.append(ported_item)
            stats["ported"] += 1

        return ported_balloons, stats

    def align_and_compare(self, img_a_b64: str, img_b_b64: str, dims_a: List, dims_b: List) -> Tuple[List, List, Dict]:
        """
        Main Pipeline:
        1. Identical Check (Short-Circuit)
        2. Decode & Preprocess
        3. Feature Match & Homography
        4. Validate Transformation
        5. Anchor IDs & Compare
        """
        # --- Step 0: Short-Circuit for Identical Files ---
        # If the string data is identical, skipping CV saves time and prevents "ghost" drifts
        if img_a_b64 == img_b_b64:
             logger.info("Identical base64 strings detected. Using perfect match.")
             return self._perfect_match(dims_a, dims_b)

        stats = {"added": 0, "removed": 0, "modified": 0, "unchanged": 0, "method": "naive"}
        
        # --- Step 1: Image Loading ---
        img_a_raw = self.decode_image(img_a_b64)
        img_b_raw = self.decode_image(img_b_b64)

        if img_a_raw is None or img_b_raw is None:
            return self._fallback_compare(dims_a, dims_b, error="Image load failure")

        # --- Step 1.5: Pixel-Perfect Check ---
        # Sometimes base64 headers differ but images are same. Check pixel hash.
        if img_a_raw.shape == img_b_raw.shape:
             diff = cv2.absdiff(img_a_raw, img_b_raw)
             if not np.any(diff):
                 logger.info("Identical image pixels detected. Using perfect match.")
                 return self._perfect_match(dims_a, dims_b)

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

        # --- Step 5: Homography Calculation (B -> A) ---
        # src = B (Train), dst = A (Query)
        src_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)

        # RANSAC is the statistical robustness layer
        M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)

        # --- Step 6: Validation ---
        if not self.validate_homography(M):
            return self._fallback_compare(dims_a, dims_b, error="Bad homography")

        # --- Step 7: Scale Correction ---
        # The matrix M is for the *scaled* images. We need to adjust it for the *original* coordinates.
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
        POSITION_TOLERANCE = 50.0 

        for db in dims_b:
            # 1. Get Center Point of B
            box = db.bounding_box
            cx = (box.xmin + box.xmax) / 2
            cy = (box.ymin + box.ymax) / 2
            
            # 2. Transform Point B -> A Space
            tx, ty = self._transform_point((cx, cy), matrix)

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

    def _perfect_match(self, dims_a, dims_b):
        """
        Handles identical files. Matches dimensions 1:1 based on value and location.
        Guarantees 0 changes if lists are identical.
        """
        stats = {"added": 0, "removed": 0, "modified": 0, "unchanged": 0, "method": "identical_short_circuit"}
        processed_b = []
        used_a_ids = set()
        
        # In a perfect copy, we assume B is a clone of A.
        # However, we must match them up logicially in case OCR order jittered slightly.
        
        for db in dims_b:
            best_match = None
            
            # Try to find exact match in A (Same ID if preserved, or same Value + Loc)
            # Since these are new uploads, IDs might reset, so we match by Value + Location
            
            box_b = db.bounding_box
            cx_b = (box_b.xmin + box_b.xmax) / 2
            cy_b = (box_b.ymin + box_b.ymax) / 2
            
            for da in dims_a:
                if da.id in used_a_ids: continue
                
                box_a = da.bounding_box
                cx_a = (box_a.xmin + box_a.xmax) / 2
                cy_a = (box_a.ymin + box_a.ymax) / 2
                
                # Strict check for "Identical"
                if abs(cx_a - cx_b) < 5 and abs(cy_a - cy_b) < 5 and str(da.value) == str(db.value):
                    best_match = da
                    break
            
            if best_match:
                db.id = best_match.id
                db.status = "unchanged"
                used_a_ids.add(best_match.id)
                stats["unchanged"] += 1
            else:
                # This technically shouldn't happen in "Identical" files unless OCR was non-deterministic
                db.status = "added"
                stats["added"] += 1
            
            processed_b.append(db)

        # Handle removals
        removed_dims = []
        for da in dims_a:
            if da.id not in used_a_ids:
                da.status = "removed"
                removed_dims.append(da)
                stats["removed"] += 1
                
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
        all_ids = [d.id for d in dims_a] + [d.id for d in processed_b if getattr(d, 'id', None)]
        next_id = (max(all_ids) if all_ids else 0) + 1
        
        for db in processed_b:
            if db.status == "added":
                db.id = next_id
                next_id += 1
                
        return processed_b, removed_dims, stats

# Export singleton
alignment_service = AlignmentService()
