import React, { useState, useRef, useEffect } from 'react';
import { API_BASE_URL } from '../constants/config';

/**
 * CMM Import Component (Production Ready)
 * 1. Uploads raw file to Backend for robust parsing (supports PC-DMIS, Calypso, CSV).
 * 2. Receives normalized JSON data.
 * 3. Performs Intelligent Weighted Matching on the Client.
 */
export function CMMImport({ dimensions, onResultsImported }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  // Data State
  const [cmmFilename, setCmmFilename] = useState(null);
  const [mappings, setMappings] = useState([]); // Array of { cmmData, matchedBalloonId, score }

  const fileInputRef = useRef(null);

  // Auto-trigger file picker when modal opens
  useEffect(() => {
    if (isOpen && !mappings.length && fileInputRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        fileInputRef.current?.click();
      }, 100);
    }
  }, [isOpen]);

  // ===========================================================================
  // 1. INTELLIGENT MATCHING ENGINE
  // ===========================================================================
  
  /**
   * Calculates a compatibility score (0-100) between a CMM row and a Balloon.
   * Logic:
   * - Nominal Value Match: +50 pts (Primary Key)
   * - ID/Label Match:      +30 pts (Secondary Key)
   * - Tolerance Match:     +20 pts (Validation)
   */
  const calculateMatchScore = (cmmRow, dimension) => {
    let score = 0;
    const EPSILON = 0.002; // Tolerance for floating point comparison

    // 1. Nominal Match (50 pts)
    const dimVal = parseFloat(dimension.value.replace(/[^\d.-]/g, ''));
    if (!isNaN(dimVal) && Math.abs(cmmRow.nominal - dimVal) <= EPSILON) {
      score += 50;
    }

    // 2. ID Match (30 pts)
    // Normalize IDs: "Dim 10", "10", "010" -> "10"
    const cmmId = String(cmmRow.feature_id).replace(/[^0-9]/g, '');
    const dimId = String(dimension.id);
    if (cmmId && cmmId === dimId) {
      score += 30;
    }

    // 3. Tolerance Match (20 pts)
    // Check if the tolerance band in CMM matches the blueprint
    // (Requires parsed tolerances on the dimension object)
    if (dimension.parsed && cmmRow.plus_tol !== undefined) {
      const dimPlus = dimension.parsed.plus_tolerance || 0;
      const dimMinus = dimension.parsed.minus_tolerance || 0;
      
      if (Math.abs(cmmRow.plus_tol - dimPlus) < EPSILON && 
          Math.abs(Math.abs(cmmRow.minus_tol) - Math.abs(dimMinus)) < EPSILON) {
        score += 20;
      }
    }

    return score;
  };

  /**
   * Runs the matching algorithm for all CMM rows against all Dimensions.
   */
  const performAutoMatch = (cmmRows, availableDimensions) => {
    return cmmRows.map((row, idx) => {
      let bestMatch = null;
      let maxScore = -1;

      availableDimensions.forEach(dim => {
        const score = calculateMatchScore(row, dim);
        if (score > maxScore) {
          maxScore = score;
          bestMatch = dim;
        }
      });

      // Threshold: Only auto-assign if score is decent (e.g., > 40)
      // This prevents matching "10.00" nominal to a random "10.00" dimension if IDs don't match
      const finalMatch = (maxScore >= 40) ? bestMatch : null;

      return {
        uuid: `cmm-${idx}`, // Internal key for React
        cmmData: row,
        matchedBalloonId: finalMatch ? finalMatch.id : '',
        matchScore: maxScore,
        manualOverride: false
      };
    });
  };

  // ===========================================================================
  // 2. API & EVENT HANDLERS
  // ===========================================================================

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // NOTE: Ensure this endpoint exists in backend/api/routes.py
      const response = await fetch(`${API_BASE_URL}/api/cmm/parse`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to parse file on server');

      const data = await response.json();
      
      if (data.success && data.results) {
        setCmmFilename(file.name);
        const autoMapped = performAutoMatch(data.results, dimensions);
        setMappings(autoMapped);
      } else {
        throw new Error(data.message || 'No data found in file');
      }

    } catch (err) {
      console.error(err);
      setError(err.message || 'Error uploading file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleMatchChange = (rowIndex, balloonId) => {
    setMappings(prev => prev.map((item, idx) => {
      if (idx !== rowIndex) return item;
      return {
        ...item,
        matchedBalloonId: balloonId ? parseInt(balloonId) : '',
        manualOverride: true
      };
    }));
  };

  const commitImport = () => {
    // Convert internal mapping state to the simple ID->Result map expected by the app
    const resultsMap = {};
    let importCount = 0;

    mappings.forEach(m => {
      if (m.matchedBalloonId) {
        resultsMap[m.matchedBalloonId] = {
          actual: m.cmmData.actual,
          deviation: m.cmmData.deviation,
          status: m.cmmData.status,
          // Store extra metadata if needed for export later
          cmm_feature: m.cmmData.feature_id 
        };
        importCount++;
      }
    });

    onResultsImported(resultsMap);
    setIsOpen(false);
  };

  // ===========================================================================
  // 3. UI RENDER
  // ===========================================================================

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md text-sm font-medium flex items-center gap-2 transition-colors border border-gray-700"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Import CMM
      </button>
    );
  }

  const matchedCount = mappings.filter(m => m.matchedBalloonId).length;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col border border-gray-800">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800 flex justify-between items-center bg-[#202020] rounded-t-xl">
          <div>
            <h2 className="text-xl font-bold text-white">Import CMM Inspection Data</h2>
            <p className="text-gray-400 text-sm mt-1">Supports PC-DMIS, Calypso, and CSV formats</p>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col bg-[#161616]">
          {error && (
            <div className="m-4 p-3 bg-red-900/30 border border-red-800 text-red-200 rounded text-sm">
              Error: {error}
            </div>
          )}

          {!mappings.length ? (
            // Upload State
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-800 m-8 rounded-xl hover:border-blue-500/50 hover:bg-gray-800/30 transition-all cursor-pointer group"
                 onClick={() => !isUploading && fileInputRef.current?.click()}>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv,.txt,.rpt"
                onChange={handleFileUpload}
              />
              
              {isUploading ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-300">Parsing CMM Report...</p>
                </div>
              ) : (
                <div className="text-center">
                  <svg className="w-16 h-16 text-gray-600 group-hover:text-blue-500 mx-auto mb-4 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-lg font-medium text-gray-300">Click to Upload Report</p>
                  <p className="text-gray-500 text-sm mt-2">Accepted: .csv, .txt (PC-DMIS), .rpt (Calypso)</p>
                </div>
              )}
            </div>
          ) : (
            // Review State
            <div className="flex-1 overflow-auto p-0">
              <div className="sticky top-0 bg-[#202020] px-6 py-2 border-b border-gray-800 flex justify-between items-center text-xs font-mono text-gray-400">
                <span>FILE: {cmmFilename}</span>
                <span>MATCHED: {matchedCount} / {mappings.length}</span>
              </div>
              
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#1a1a1a] sticky top-8 z-10 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                  <tr>
                    <th className="px-6 py-3 border-b border-gray-800">CMM Feature</th>
                    <th className="px-6 py-3 border-b border-gray-800">Nominal</th>
                    <th className="px-6 py-3 border-b border-gray-800">Actual</th>
                    <th className="px-6 py-3 border-b border-gray-800">Deviation</th>
                    <th className="px-6 py-3 border-b border-gray-800 w-1/3">Mapped Balloon</th>
                    <th className="px-6 py-3 border-b border-gray-800">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-sm text-gray-300">
                  {mappings.map((row, idx) => (
                    <tr key={row.uuid} className="hover:bg-[#202020] transition-colors">
                      <td className="px-6 py-3 font-medium text-white">
                        {row.cmmData.feature_id} 
                        {row.cmmData.axis && <span className="ml-2 text-xs bg-gray-700 px-1 rounded text-gray-300">{row.cmmData.axis}</span>}
                      </td>
                      <td className="px-6 py-3 font-mono text-gray-400">{row.cmmData.nominal}</td>
                      <td className="px-6 py-3 font-mono">{row.cmmData.actual}</td>
                      <td className={`px-6 py-3 font-mono ${Math.abs(row.cmmData.deviation) > 0.0001 ? 'text-yellow-500' : 'text-gray-500'}`}>
                        {row.cmmData.deviation}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={row.matchedBalloonId}
                            onChange={(e) => handleMatchChange(idx, e.target.value)}
                            className={`w-full bg-[#111] border rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 text-sm
                              ${row.matchedBalloonId ? 'border-blue-900/50 text-white' : 'border-gray-700 text-gray-500'}
                            `}
                          >
                            <option value="">-- Unmapped --</option>
                            {dimensions.map(d => (
                              <option key={d.id} value={d.id}>
                                #{d.id} - {d.value} {d.parsed?.subtype ? `(${d.parsed.subtype})` : ''}
                              </option>
                            ))}
                          </select>
                          
                          {/* Confidence Indicator */}
                          {row.matchScore > 0 && !row.manualOverride && (
                            <div className="group relative">
                              <div className={`w-2 h-2 rounded-full ${row.matchScore > 80 ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none border border-gray-700">
                                Match Score: {row.matchScore}%
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                         <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                          ${row.cmmData.status === 'PASS' ? 'bg-green-900/30 text-green-400 border border-green-900' : 
                            row.cmmData.status === 'FAIL' ? 'bg-red-900/30 text-red-400 border border-red-900' : 
                            'bg-gray-800 text-gray-400 border border-gray-700'}`}>
                           {row.cmmData.status || 'UNK'}
                         </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-800 bg-[#202020] rounded-b-xl flex justify-between items-center">
          {mappings.length > 0 ? (
             <button
              onClick={() => { setMappings([]); setCmmFilename(null); }}
              className="text-sm text-gray-400 hover:text-white"
            >
              Reset / Upload New
            </button>
          ) : <div></div>}
         
          <div className="flex gap-3">
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 bg-transparent hover:bg-gray-800 text-gray-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={commitImport}
              disabled={matchedCount === 0}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2"
            >
              <span>Import Data</span>
              {matchedCount > 0 && <span className="bg-blue-800 px-2 py-0.5 rounded text-xs text-blue-100">{matchedCount}</span>}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
