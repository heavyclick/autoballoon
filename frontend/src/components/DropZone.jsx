import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUsage } from '../hooks/useUsage';
import { API_BASE_URL, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS } from '../constants/config';

export function DropZone({ onBeforeProcess }) {
  const { token, isPro } = useAuth();
  const { visitorId, incrementUsage, usage, refreshUsage } = useUsage();
  const fileInputRef = useRef(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showRevisionCompare, setShowRevisionCompare] = useState(false);

  useEffect(() => { if (refreshUsage) refreshUsage(); }, []);

  const checkUsageLimit = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/usage/check?visitor_id=${visitorId}`);
      if (response.ok) {
        const data = await response.json();
        if (!data.is_pro && data.remaining <= 0) {
          setShowPaywall(true);
          return false;
        }
      }
    } catch (e) {}
    return true;
  };

  const handleDragEnter = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);

  const validateFile = (file) => {
    if (!file) return 'No file selected';
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return `Unsupported format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return `File too large. Maximum: ${MAX_FILE_SIZE_MB}MB`;
    return null;
  };

  const processFile = async (file) => {
    const canProceed = await checkUsageLimit();
    if (!canProceed) return;
    const validationError = validateFile(file);
    if (validationError) { setError(validationError); return; }
    if (onBeforeProcess && !onBeforeProcess()) return;
    setIsProcessing(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (!token) formData.append('visitor_id', visitorId);
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/process`, { method: 'POST', headers, body: formData });
      const data = await response.json();
      if (data.success) {
        setResult(data);
        await incrementUsage();
        if (refreshUsage) await refreshUsage();
      } else {
        if (data.error?.code === 'USAGE_LIMIT_EXCEEDED') setShowPaywall(true);
        else setError(data.error?.message || 'Processing failed');
      }
    } catch (err) {
      setError('Network error. Please check your connection.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) processFile(files[0]);
  }, [token, visitorId, onBeforeProcess, usage]);

  const handleFileChange = (e) => { if (e.target.files?.[0]) processFile(e.target.files[0]); };
  const handleClick = () => { fileInputRef.current?.click(); };
  const handleReset = () => { setResult(null); setError(null); };

  const handleRevisionCompareResult = async (comparisonData) => {
    await incrementUsage();
    if (refreshUsage) await refreshUsage();
    setResult(comparisonData);
    setShowRevisionCompare(false);
  };

  const handleOpenCompare = async () => {
    const canProceed = await checkUsageLimit();
    if (canProceed) setShowRevisionCompare(true);
  };

  if (showPaywall) return <PaywallModal onClose={() => setShowPaywall(false)} usage={usage} />;
  if (showRevisionCompare) return <RevisionCompare onClose={() => setShowRevisionCompare(false)} onComplete={handleRevisionCompareResult} visitorId={visitorId} incrementUsage={incrementUsage} checkUsageLimit={checkUsageLimit} />;
  if (result) return <BlueprintViewer result={result} onReset={handleReset} token={token} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <button onClick={handleOpenCompare} className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl transition-all text-sm flex items-center gap-2 font-medium shadow-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          Compare Revisions (Delta FAI)
        </button>
      </div>
      <div
        className={`relative border-2 border-dashed rounded-xl p-12 transition-all duration-200 cursor-pointer ${isDragging ? 'border-[#E63946] bg-[#E63946]/10' : 'border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#1a1a1a]'} ${isProcessing ? 'pointer-events-none' : ''}`}
        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop} onClick={handleClick}
      >
        <input ref={fileInputRef} type="file" accept={ALLOWED_EXTENSIONS.join(',')} onChange={handleFileChange} className="hidden" />
        {isProcessing ? (
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#E63946] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xl font-medium text-white mb-2">Processing...</p>
            <p className="text-gray-400 text-sm">Detecting dimensions, this may take a moment</p>
          </div>
        ) : (
          <div className="text-center">
            <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center ${isDragging ? 'bg-[#E63946]/20' : 'bg-[#1a1a1a]'}`}>
              <svg className={`w-10 h-10 ${isDragging ? 'text-[#E63946]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-xl font-medium text-white mb-2">{isDragging ? 'Drop your file here' : 'Drag & drop your blueprint'}</p>
            <p className="text-gray-400 mb-4">or <span className="text-[#E63946]">click to browse</span></p>
            <p className="text-gray-500 text-sm">PDF, PNG, JPEG, TIFF - Max {MAX_FILE_SIZE_MB}MB</p>
          </div>
        )}
        {error && <div className="absolute inset-x-0 bottom-4 text-center"><p className="text-red-500 text-sm">{error}</p></div>}
      </div>
    </div>
  );
}

// ============ PAYWALL MODAL ============
function PaywallModal({ onClose, usage }) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [countdown, setCountdown] = useState({ hours: 24, minutes: 0, seconds: 0 });
  const isPaymentConfigured = false;

  useEffect(() => {
    if (!isPaymentConfigured) {
      const timer = setInterval(() => {
        setCountdown(prev => {
          let { hours, minutes, seconds } = prev;
          if (seconds > 0) seconds--;
          else if (minutes > 0) { minutes--; seconds = 59; }
          else if (hours > 0) { hours--; minutes = 59; seconds = 59; }
          return { hours, minutes, seconds };
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isPaymentConfigured]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    try {
      await fetch(`${API_BASE_URL}/waitlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      setSubmitted(true);
    } catch (err) { console.error('Failed to join waitlist:', err); }
    setIsSubmitting(false);
  };

  if (isPaymentConfigured) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-[#161616] rounded-2xl max-w-md w-full p-8 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-[#E63946]/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#E63946]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Free Limit Reached</h2>
            <p className="text-gray-400">You have used all {usage?.limit || 3} free drawings this month.</p>
          </div>
          <div className="bg-[#1a1a1a] rounded-xl p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-white font-semibold">Pro Plan</span>
              <div><span className="text-3xl font-bold text-white">$99</span><span className="text-gray-400">/month</span></div>
            </div>
            <ul className="space-y-3 text-sm">
              {['Unlimited blueprint processing', 'AS9102 Form 3 Excel exports', 'CMM results import', 'Revision comparison (Delta FAI)'].map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-gray-300">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <a href="/pricing" className="block w-full py-3 bg-[#E63946] hover:bg-[#c62d39] text-white font-semibold rounded-lg text-center transition-colors">Upgrade to Pro</a>
          <p className="text-center text-gray-500 text-sm mt-4">Free limit resets on the 1st of each month</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161616] rounded-2xl max-w-md w-full p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        {!submitted ? (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">You are Early!</h2>
              <p className="text-gray-400">AutoBalloon Pro launches in</p>
            </div>
            <div className="flex justify-center gap-4 mb-6">
              <div className="bg-[#1a1a1a] rounded-lg p-3 text-center min-w-[70px]"><div className="text-2xl font-bold text-white">{String(countdown.hours).padStart(2, '0')}</div><div className="text-xs text-gray-500">HOURS</div></div>
              <div className="bg-[#1a1a1a] rounded-lg p-3 text-center min-w-[70px]"><div className="text-2xl font-bold text-white">{String(countdown.minutes).padStart(2, '0')}</div><div className="text-xs text-gray-500">MINS</div></div>
              <div className="bg-[#1a1a1a] rounded-lg p-3 text-center min-w-[70px]"><div className="text-2xl font-bold text-white">{String(countdown.seconds).padStart(2, '0')}</div><div className="text-xs text-gray-500">SECS</div></div>
            </div>
            <div className="bg-[#1a1a1a] rounded-xl p-4 mb-6"><p className="text-gray-300 text-sm text-center">Be the first to know when we launch. Get <span className="text-[#E63946] font-semibold">50% off</span> as an early supporter.</p></div>
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white placeholder-gray-500 focus:border-[#E63946] focus:outline-none" required />
              <button type="submit" disabled={isSubmitting} className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50">{isSubmitting ? 'Joining...' : 'Notify Me at Launch'}</button>
            </form>
            <p className="text-center text-gray-500 text-xs mt-4">No spam. Just one email when Pro is ready.</p>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></div>
            <h2 className="text-2xl font-bold text-white mb-2">You are on the List!</h2>
            <p className="text-gray-400 mb-4">We will email you the moment AutoBalloon Pro launches.</p>
            <p className="text-[#E63946] font-semibold">50% early bird discount reserved</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ REVISION COMPARE ============
function RevisionCompare({ onClose, onComplete, visitorId, incrementUsage, checkUsageLimit }) {
  const [revA, setRevA] = useState(null);
  const [revB, setRevB] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);
  const fileInputARef = useRef(null);
  const fileInputBRef = useRef(null);

  const handleFileSelect = (file, setRev) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setRev({ file, name: file.name, preview: e.target.result });
    reader.readAsDataURL(file);
  };

  const handleCompare = async () => {
    if (!revA || !revB) return;
    const canProceed = await checkUsageLimit();
    if (!canProceed) { onClose(); return; }
    setIsComparing(true);
    try {
      const [formDataA, formDataB] = [new FormData(), new FormData()];
      formDataA.append('file', revA.file);
      formDataB.append('file', revB.file);
      const [responseA, responseB] = await Promise.all([
        fetch(`${API_BASE_URL}/process`, { method: 'POST', body: formDataA }),
        fetch(`${API_BASE_URL}/process`, { method: 'POST', body: formDataB })
      ]);
      const [dataA, dataB] = await Promise.all([responseA.json(), responseB.json()]);
      if (dataA.success && dataB.success) {
        const dimsA = dataA.dimensions || [];
        const dimsB = dataB.dimensions || [];
        const changes = { added: [], removed: [], modified: [], unchanged: [] };
        const filterTitleBlock = (dims) => dims.filter(d => {
          const centerY = (d.bounding_box.ymin + d.bounding_box.ymax) / 2;
          return centerY < 800;
        });
        const filteredA = filterTitleBlock(dimsA);
        const filteredB = filterTitleBlock(dimsB);
        const TOLERANCE = 20;
        filteredB.forEach(dimB => {
          const centerBX = (dimB.bounding_box.xmin + dimB.bounding_box.xmax) / 2;
          const centerBY = (dimB.bounding_box.ymin + dimB.bounding_box.ymax) / 2;
          const matchA = filteredA.find(dimA => {
            const centerAX = (dimA.bounding_box.xmin + dimA.bounding_box.xmax) / 2;
            const centerAY = (dimA.bounding_box.ymin + dimA.bounding_box.ymax) / 2;
            return Math.abs(centerAX - centerBX) < TOLERANCE && Math.abs(centerAY - centerBY) < TOLERANCE;
          });
          if (!matchA) changes.added.push({ ...dimB, changeType: 'added' });
          else if (matchA.value !== dimB.value) changes.modified.push({ ...dimB, changeType: 'modified', oldValue: matchA.value, newValue: dimB.value });
          else changes.unchanged.push({ ...dimB, changeType: 'unchanged' });
        });
        filteredA.forEach(dimA => {
          const centerAX = (dimA.bounding_box.xmin + dimA.bounding_box.xmax) / 2;
          const centerAY = (dimA.bounding_box.ymin + dimA.bounding_box.ymax) / 2;
          const matchB = filteredB.find(dimB => {
            const centerBX = (dimB.bounding_box.xmin + dimB.bounding_box.xmax) / 2;
            const centerBY = (dimB.bounding_box.ymin + dimB.bounding_box.ymax) / 2;
            return Math.abs(centerAX - centerBX) < TOLERANCE && Math.abs(centerAY - centerBY) < TOLERANCE;
          });
          if (!matchB) changes.removed.push({ ...dimA, changeType: 'removed' });
        });
        setComparisonResult({ revA: dataA, revB: dataB, changes, summary: { added: changes.added.length, removed: changes.removed.length, modified: changes.modified.length, unchanged: changes.unchanged.length } });
      }
    } catch (err) { console.error('Comparison failed:', err); }
    finally { setIsComparing(false); }
  };

  const handleUseChanges = () => {
    if (comparisonResult && onComplete) {
      const changedDimensions = [...comparisonResult.changes.added, ...comparisonResult.changes.modified].map((dim, idx) => ({ ...dim, id: idx + 1 }));
      onComplete({ dimensions: changedDimensions, image: comparisonResult.revB.image, metadata: comparisonResult.revB.metadata, comparison: comparisonResult });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161616] rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-[#2a2a2a] flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white"><span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">Delta FAI</span> - Revision Compare</h2>
            <p className="text-gray-400 text-sm">Upload two revisions to find only what changed</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {!comparisonResult ? (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-white font-medium mb-3 flex items-center gap-2"><span className="w-6 h-6 rounded bg-gray-600 flex items-center justify-center text-xs">A</span>Old Revision</h3>
                <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${revA ? 'border-green-500/50 bg-green-500/5' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'}`} onClick={() => fileInputARef.current?.click()}>
                  <input ref={fileInputARef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => handleFileSelect(e.target.files[0], setRevA)} className="hidden" />
                  {revA ? (<div><img src={revA.preview} alt="Rev A" className="max-h-48 mx-auto rounded mb-2" /><p className="text-green-400 text-sm">{revA.name}</p></div>) : (<div><svg className="w-10 h-10 text-gray-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg><p className="text-gray-400">Upload Rev A (Old)</p></div>)}
                </div>
              </div>
              <div>
                <h3 className="text-white font-medium mb-3 flex items-center gap-2"><span className="w-6 h-6 rounded bg-[#E63946] flex items-center justify-center text-xs text-white">B</span>New Revision</h3>
                <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${revB ? 'border-[#E63946]/50 bg-[#E63946]/5' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'}`} onClick={() => fileInputBRef.current?.click()}>
                  <input ref={fileInputBRef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => handleFileSelect(e.target.files[0], setRevB)} className="hidden" />
                  {revB ? (<div><img src={revB.preview} alt="Rev B" className="max-h-48 mx-auto rounded mb-2" /><p className="text-[#E63946] text-sm">{revB.name}</p></div>) : (<div><svg className="w-10 h-10 text-gray-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg><p className="text-gray-400">Upload Rev B (New)</p></div>)}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center"><div className="text-3xl font-bold text-green-400">{comparisonResult.summary.added}</div><div className="text-green-400/70 text-sm">Added</div></div>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center"><div className="text-3xl font-bold text-yellow-400">{comparisonResult.summary.modified}</div><div className="text-yellow-400/70 text-sm">Modified</div></div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center"><div className="text-3xl font-bold text-red-400">{comparisonResult.summary.removed}</div><div className="text-red-400/70 text-sm">Removed</div></div>
                <div className="bg-gray-500/10 border border-gray-500/30 rounded-xl p-4 text-center"><div className="text-3xl font-bold text-gray-400">{comparisonResult.summary.unchanged}</div><div className="text-gray-400/70 text-sm">Unchanged</div></div>
              </div>
              <div className="bg-[#0a0a0a] rounded-xl overflow-hidden max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-[#1a1a1a] sticky top-0"><tr><th className="px-4 py-2 text-left text-gray-400">Status</th><th className="px-4 py-2 text-left text-gray-400">Zone</th><th className="px-4 py-2 text-left text-gray-400">Old</th><th className="px-4 py-2 text-left text-gray-400">New</th></tr></thead>
                  <tbody>
                    {comparisonResult.changes.added.map((dim, i) => (<tr key={`a${i}`} className="border-t border-[#1a1a1a]"><td className="px-4 py-2"><span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">ADDED</span></td><td className="px-4 py-2 text-gray-300">{dim.zone || '-'}</td><td className="px-4 py-2 text-gray-500">-</td><td className="px-4 py-2 text-white font-mono">{dim.value}</td></tr>))}
                    {comparisonResult.changes.modified.map((dim, i) => (<tr key={`m${i}`} className="border-t border-[#1a1a1a]"><td className="px-4 py-2"><span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">MODIFIED</span></td><td className="px-4 py-2 text-gray-300">{dim.zone || '-'}</td><td className="px-4 py-2 text-gray-500 font-mono line-through">{dim.oldValue}</td><td className="px-4 py-2 text-white font-mono">{dim.newValue}</td></tr>))}
                    {comparisonResult.changes.removed.map((dim, i) => (<tr key={`r${i}`} className="border-t border-[#1a1a1a]"><td className="px-4 py-2"><span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">REMOVED</span></td><td className="px-4 py-2 text-gray-300">{dim.zone || '-'}</td><td className="px-4 py-2 text-red-400 font-mono">{dim.value}</td><td className="px-4 py-2 text-gray-500">-</td></tr>))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-between">
          {!comparisonResult ? (
            <><div className="text-gray-500 text-sm">{revA && revB ? 'Ready to compare' : 'Upload both revisions'}</div>
            <button onClick={handleCompare} disabled={!revA || !revB || isComparing} className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
              {isComparing ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Comparing...</> : 'Compare Revisions'}
            </button></>
          ) : (
            <><button onClick={() => setComparisonResult(null)} className="text-gray-400 hover:text-white">Compare Different Files</button>
            <button onClick={handleUseChanges} className="px-6 py-2 bg-[#E63946] hover:bg-[#c62d39] text-white font-medium rounded-lg">Balloon Only Changes ({comparisonResult.summary.added + comparisonResult.summary.modified})</button></>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ BLUEPRINT VIEWER WITH DRAGGABLE BALLOONS ============
// FIXED: Leader line now moves WITH balloon when dragging (not just stretches)
function BlueprintViewer({ result, onReset, token }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  // FIXED: Store anchor and balloon positions separately for proper drag behavior
  const [dimensions, setDimensions] = useState(() => 
    (result.dimensions || []).map(d => ({
      ...d,
      // Anchor point (where leader line starts - on the dimension)
      anchorX: (d.bounding_box.xmin + d.bounding_box.xmax) / 2 / 10,
      anchorY: (d.bounding_box.ymin + d.bounding_box.ymax) / 2 / 10,
      // Balloon position (the circle with the number)
      balloonX: (d.bounding_box.xmin + d.bounding_box.xmax) / 2 / 10 + 4,
      balloonY: (d.bounding_box.ymin + d.bounding_box.ymax) / 2 / 10 - 4,
    }))
  );
  const [isAddingBalloon, setIsAddingBalloon] = useState(false);
  const [newBalloonValue, setNewBalloonValue] = useState('');
  const [showCMMImport, setShowCMMImport] = useState(false);
  const [cmmResults, setCmmResults] = useState({});
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  
  const handleExport = async (format = 'xlsx') => {
    setIsExporting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { 'Authorization': `Bearer ${token}` }) },
        body: JSON.stringify({ format, template: 'AS9102_FORM3', dimensions: dimensions.map(d => ({ id: d.id, value: d.value, zone: d.zone, actual: cmmResults[d.id]?.actual || '' })), filename: result.metadata?.filename || 'inspection' }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${result.metadata?.filename || 'inspection'}_FAI.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (err) { console.error('Export failed:', err); }
    finally { setIsExporting(false); }
  };

  const handleDownloadImage = async () => {
    setIsDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = imageRef.current;
      if (!img) { setIsDownloading(false); return; }
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      const balloonRadius = Math.max(24, canvas.width * 0.02);
      const fontSize = Math.max(16, canvas.width * 0.014);
      const lineWidth = Math.max(3, canvas.width * 0.002);
      
      dimensions.forEach(dim => {
        const anchorX = (dim.anchorX / 100) * canvas.width;
        const anchorY = (dim.anchorY / 100) * canvas.height;
        const balloonX = (dim.balloonX / 100) * canvas.width;
        const balloonY = (dim.balloonY / 100) * canvas.height;
        
        ctx.beginPath(); ctx.moveTo(anchorX, anchorY); ctx.lineTo(balloonX, balloonY);
        ctx.strokeStyle = '#E63946'; ctx.lineWidth = lineWidth; ctx.stroke();
        ctx.beginPath(); ctx.arc(anchorX, anchorY, Math.max(4, lineWidth * 1.5), 0, Math.PI * 2);
        ctx.fillStyle = '#E63946'; ctx.fill();
        ctx.beginPath(); ctx.arc(balloonX, balloonY, balloonRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'white'; ctx.fill(); ctx.strokeStyle = '#E63946'; ctx.lineWidth = lineWidth; ctx.stroke();
        ctx.fillStyle = '#E63946'; ctx.font = `bold ${fontSize}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dim.id.toString(), balloonX, balloonY);
      });
      
      canvas.toBlob((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `${result.metadata?.filename || 'blueprint'}_ballooned.png`;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); a.remove();
        setIsDownloading(false);
      }, 'image/png');
    } catch (err) { console.error('Download failed:', err); setIsDownloading(false); }
  };

  const handleDeleteDimension = (id) => { setDimensions(prev => prev.filter(d => d.id !== id)); };

  const handleImageClick = (e) => {
    if (!isAddingBalloon || !newBalloonValue.trim()) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    const x = xPercent * 10;
    const y = yPercent * 10;
    const colIndex = Math.floor(x / 125);
    const rowIndex = Math.floor(y / 250);
    const columns = ["H", "G", "F", "E", "D", "C", "B", "A"];
    const rows = ["4", "3", "2", "1"];
    const zone = `${columns[Math.min(colIndex, 7)]}${rows[Math.min(rowIndex, 3)]}`;
    const newId = dimensions.length > 0 ? Math.max(...dimensions.map(d => d.id)) + 1 : 1;
    setDimensions(prev => [...prev, {
      id: newId, value: newBalloonValue.trim(), zone,
      bounding_box: { xmin: x - 20, xmax: x + 20, ymin: y - 10, ymax: y + 10 },
      anchorX: xPercent, anchorY: yPercent,
      balloonX: xPercent + 4, balloonY: yPercent - 4,
    }]);
    setNewBalloonValue('');
    setIsAddingBalloon(false);
  };

  // FIXED: Move BOTH anchor and balloon together when dragging
  const handleBalloonDrag = (id, deltaX, deltaY) => {
    setDimensions(prev => prev.map(d => {
      if (d.id !== id) return d;
      return {
        ...d,
        anchorX: d.anchorX + deltaX,
        anchorY: d.anchorY + deltaY,
        balloonX: d.balloonX + deltaX,
        balloonY: d.balloonY + deltaY,
      };
    }));
  };

  const handleCMMImport = (results) => { setCmmResults(results); setShowCMMImport(false); };

  return (
    <div className="space-y-6">
      {showCMMImport && <CMMImportModal dimensions={dimensions} onClose={() => setShowCMMImport(false)} onImport={handleCMMImport} />}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={onReset} className="text-gray-400 hover:text-white transition-colors flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            New Upload
          </button>
          <div className="h-6 w-px bg-[#2a2a2a]" />
          <span className="text-sm"><span className="text-gray-400">Detected: </span><span className="text-white font-medium">{dimensions.length} dimensions</span></span>
          {result.grid?.detected && <><div className="h-6 w-px bg-[#2a2a2a]" /><span className="text-sm"><span className="text-gray-400">Grid: </span><span className="text-white font-medium">{result.grid.columns?.length}x{result.grid.rows?.length}</span></span></>}
          {result.metadata?.processing_time_ms && <><div className="h-6 w-px bg-[#2a2a2a]" /><span className="text-sm"><span className="text-gray-400">Time: </span><span className="text-white font-medium">{(result.metadata.processing_time_ms / 1000).toFixed(1)}s</span></span></>}
          <div className="h-6 w-px bg-[#2a2a2a]" />
          {isAddingBalloon ? (
            <div className="flex items-center gap-2">
              <input type="text" value={newBalloonValue} onChange={(e) => setNewBalloonValue(e.target.value)} placeholder="Value..." className="px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-white text-sm w-24" autoFocus />
              <button onClick={() => setIsAddingBalloon(false)} className="text-gray-400 hover:text-white text-sm">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setIsAddingBalloon(true)} className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 rounded-lg transition-colors text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Balloon
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowCMMImport(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Import CMM
          </button>
          <button onClick={handleDownloadImage} disabled={isDownloading} className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 rounded-lg transition-colors text-sm disabled:opacity-50">{isDownloading ? 'Saving...' : 'Download Image'}</button>
          <button onClick={() => handleExport('csv')} disabled={isExporting} className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 rounded-lg transition-colors text-sm disabled:opacity-50">Export CSV</button>
          <button onClick={() => handleExport('xlsx')} disabled={isExporting} className="px-4 py-2 bg-[#E63946] hover:bg-[#c62d39] text-white font-medium rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            AS9102 Excel
          </button>
        </div>
      </div>

      <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm text-gray-400 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>Tip: Drag balloons to reposition them. The balloon and leader line move together.</span>
      </div>

      <div ref={containerRef} className={`relative bg-[#0a0a0a] rounded-xl overflow-hidden ${isAddingBalloon ? 'cursor-crosshair' : ''}`} style={{ minHeight: '500px' }} onClick={handleImageClick}>
        {result.image && <img ref={imageRef} src={result.image} alt="Blueprint" className="w-full h-auto" crossOrigin="anonymous" />}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {dimensions.map((dim) => (
            <g key={`leader-${dim.id}`}>
              <line x1={`${dim.anchorX}%`} y1={`${dim.anchorY}%`} x2={`${dim.balloonX}%`} y2={`${dim.balloonY}%`} stroke="#E63946" strokeWidth="2" />
              <circle cx={`${dim.anchorX}%`} cy={`${dim.anchorY}%`} r="4" fill="#E63946" />
            </g>
          ))}
        </svg>
        {dimensions.map((dim) => (
          <DraggableBalloon key={dim.id} dimension={dim} left={dim.balloonX} top={dim.balloonY} onDelete={() => handleDeleteDimension(dim.id)} onDrag={handleBalloonDrag} cmmResult={cmmResults[dim.id]} containerRef={containerRef} />
        ))}
        {isAddingBalloon && <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none"><span className="bg-[#E63946] text-white px-4 py-2 rounded-lg text-sm">Click to place balloon</span></div>}
      </div>

      <div className="bg-[#0a0a0a] rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-[#1a1a1a] border-b border-[#2a2a2a]"><h3 className="font-medium text-white">Detected Dimensions</h3></div>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#161616] sticky top-0"><tr><th className="px-4 py-2 text-left text-gray-400 font-medium">#</th><th className="px-4 py-2 text-left text-gray-400 font-medium">Zone</th><th className="px-4 py-2 text-left text-gray-400 font-medium">Nominal</th><th className="px-4 py-2 text-left text-gray-400 font-medium">Actual</th><th className="px-4 py-2 text-left text-gray-400 font-medium">Status</th><th className="px-4 py-2 text-right text-gray-400 font-medium">Actions</th></tr></thead>
            <tbody>
              {dimensions.map((dim) => (
                <tr key={dim.id} className="border-b border-[#1a1a1a] hover:bg-[#161616]">
                  <td className="px-4 py-2 text-white">{dim.id}</td>
                  <td className="px-4 py-2 text-gray-300">{dim.zone || '-'}</td>
                  <td className="px-4 py-2 text-white font-mono">{dim.value}</td>
                  <td className="px-4 py-2 text-white font-mono">{cmmResults[dim.id]?.actual || '-'}</td>
                  <td className="px-4 py-2">{cmmResults[dim.id]?.status && <span className={`px-2 py-1 rounded text-xs ${cmmResults[dim.id].status === 'PASS' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{cmmResults[dim.id].status}</span>}</td>
                  <td className="px-4 py-2 text-right"><button onClick={() => handleDeleteDimension(dim.id)} className="text-gray-500 hover:text-red-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {dimensions.length === 0 && <div className="px-4 py-8 text-center text-gray-500">No dimensions detected.</div>}
        </div>
      </div>
    </div>
  );
}

// ============ DRAGGABLE BALLOON ============
function DraggableBalloon({ dimension, left, top, onDelete, onDrag, cmmResult, containerRef }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const hasResult = cmmResult?.actual;
  const isPassing = cmmResult?.status === 'PASS';

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    startPos.current = { x: e.clientX, y: e.clientY };
    
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const deltaX = ((e.clientX - startPos.current.x) / rect.width) * 100;
      const deltaY = ((e.clientY - startPos.current.y) / rect.height) * 100;
      startPos.current = { x: e.clientX, y: e.clientY };
      onDrag(dimension.id, deltaX, deltaY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${isDragging ? 'cursor-grabbing z-50' : 'cursor-grab'}`}
      style={{ left: `${left}%`, top: `${top}%` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={handleMouseDown}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-lg ${hasResult ? (isPassing ? 'bg-green-500 text-white border-2 border-green-400' : 'bg-red-500 text-white border-2 border-red-400') : (isHovered || isDragging ? 'bg-[#E63946] text-white scale-110' : 'bg-white text-[#E63946] border-2 border-[#E63946]')}`}>
        {dimension.id}
      </div>
      {isHovered && !isDragging && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 whitespace-nowrap z-10 shadow-xl">
          <div className="text-white font-mono text-sm">{dimension.value}</div>
          {dimension.zone && <div className="text-gray-400 text-xs">Zone: {dimension.zone}</div>}
          {cmmResult?.actual && <div className="text-blue-400 text-xs mt-1">Actual: {cmmResult.actual}</div>}
          {cmmResult?.status && <div className={`text-xs ${cmmResult.status === 'PASS' ? 'text-green-400' : 'text-red-400'}`}>{cmmResult.status}</div>}
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-red-500 text-xs hover:underline mt-1">Delete</button>
        </div>
      )}
    </div>
  );
}

// ============ CMM IMPORT MODAL ============
function CMMImportModal({ dimensions, onClose, onImport }) {
  const [csvData, setCsvData] = useState(null);
  const [mappings, setMappings] = useState([]);
  const fileInputRef = useRef(null);

  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, i) => row[h] = values[i] || '');
      return row;
    });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = parseCSV(event.target.result);
      setCsvData(data);
      const autoMappings = data.map((row, idx) => {
        const featureNum = row.feature || row.id || row['feature #'] || row['feature number'] || (idx + 1).toString();
        const match = dimensions.find(d => d.id.toString() === featureNum.toString());
        return { cmmIndex: idx, cmmData: row, matchedBalloon: match?.id || null, actualValue: row.actual || row.measured || row.result || '', status: row.status || (row.pass === 'true' || row.pass === '1' ? 'PASS' : row.pass === 'false' || row.pass === '0' ? 'FAIL' : '') };
      });
      setMappings(autoMappings);
    };
    reader.readAsText(file);
  };

  const handleMappingChange = (idx, balloonId) => { setMappings(prev => prev.map((m, i) => i === idx ? { ...m, matchedBalloon: balloonId ? parseInt(balloonId) : null } : m)); };

  const handleImport = () => {
    const results = {};
    mappings.forEach(m => { if (m.matchedBalloon) results[m.matchedBalloon] = { actual: m.actualValue, status: m.status }; });
    onImport(results);
  };

  const matchedCount = mappings.filter(m => m.matchedBalloon).length;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161616] rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-[#2a2a2a] flex justify-between items-center">
          <div><h2 className="text-xl font-bold text-white">Import CMM Results</h2><p className="text-gray-400 text-sm">Upload your CMM CSV to auto-fill measurement results</p></div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {!csvData ? (
            <div className="border-2 border-dashed border-[#2a2a2a] rounded-xl p-12 text-center cursor-pointer hover:border-[#3a3a3a]" onClick={() => fileInputRef.current?.click()}>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              <svg className="w-12 h-12 text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              <p className="text-white font-medium mb-2">Upload CMM CSV File</p>
              <p className="text-gray-500 text-sm">Supports standard CMM export formats</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between"><span className="text-green-500 font-medium">{matchedCount} of {mappings.length} matched</span><button onClick={() => { setCsvData(null); setMappings([]); }} className="text-gray-400 hover:text-white text-sm">Upload different file</button></div>
              <div className="bg-[#0a0a0a] rounded-xl overflow-hidden max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-[#1a1a1a] sticky top-0"><tr><th className="px-4 py-3 text-left text-gray-400">CMM Feature</th><th className="px-4 py-3 text-left text-gray-400">Actual</th><th className="px-4 py-3 text-left text-gray-400">Match to Balloon</th><th className="px-4 py-3 text-left text-gray-400">Status</th></tr></thead>
                  <tbody>
                    {mappings.map((m, idx) => (
                      <tr key={idx} className="border-t border-[#1a1a1a]">
                        <td className="px-4 py-3 text-white">{m.cmmData.feature || m.cmmData.id || `Row ${idx + 1}`}</td>
                        <td className="px-4 py-3 text-white font-mono">{m.actualValue || '-'}</td>
                        <td className="px-4 py-3"><select value={m.matchedBalloon || ''} onChange={(e) => handleMappingChange(idx, e.target.value)} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-white text-sm"><option value="">No match</option>{dimensions.map(d => <option key={d.id} value={d.id}>#{d.id} - {d.value}</option>)}</select></td>
                        <td className="px-4 py-3">{m.status && <span className={`px-2 py-1 rounded text-xs ${m.status === 'PASS' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{m.status}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        {csvData && (
          <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
            <button onClick={handleImport} disabled={matchedCount === 0} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50">Import {matchedCount} Results</button>
          </div>
        )}
      </div>
    </div>
  );
}
