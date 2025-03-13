
import React, { useState, useCallback, useEffect, useRef } from "react";
import * as _ from 'lodash';
import Papa from 'papaparse';
import './App.css';

// Types for our application
// interface JsonEntry {
//   id: string;
//   fileName: string;
//   originalJson: string;
//   correctedJson: string;
//   formattedJson: string;
//   error?: string;
//   fields: string[];
//   status: 'processed' | 'error' | 'warning';
//   timestamp: string;
// }

// interface MergedDataset {
//   id: string;
//   name: string;
//   records: any[];
//   fields: string[];
//   schema: {[key: string]: string};
//   timestamp: string;
// }

// interface QueueItem {
//   id: string;
//   content: string;
//   fileName: string;
//   status: 'queued' | 'processing' | 'completed' | 'error';
//   errorMessage?: string;
// }

// Main App Component
const App = () => {
  // State management
  const [jsonInputText, setJsonInputText] = useState("");
  const [processedEntries, setProcessedEntries] = useState([]);
  const [mergedDatasets, setMergedDatasets] = useState([]);
  const [activeDataset, setActiveDataset] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedEntries, setSelectedEntries] = useState(new Set());
  const [expandedEntry, setExpandedEntry] = useState(null);
  const [activeTab, setActiveTab] = useState('input');
  const [processingQueue, setProcessingQueue] = useState([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [processingOptions, setProcessingOptions] = useState({
    autoFormat: true,
    detectSchemas: true,
    flattenNested: true,
    maxDepth: 3,
    trimLongValues: true,
    maxValueLength: 1000,
    preserveArrays: true,
  });
  
  // References to maintain state across renders
  const processingQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  
  // Keep refs in sync with state
  useEffect(() => {
    processingQueueRef.current = processingQueue;
    isProcessingQueueRef.current = isProcessingQueue;
  }, [processingQueue, isProcessingQueue]);
  
  // Load saved data on initial render
  useEffect(() => {
    const savedProcessedEntries = localStorage.getItem("jsonProcessorEntries");
    const savedMergedDatasets = localStorage.getItem("jsonProcessorDatasets");
    
    if (savedProcessedEntries) {
      try {
        setProcessedEntries(JSON.parse(savedProcessedEntries));
      } catch (e) {
        console.error("Failed to parse saved entries:", e);
      }
    }
    
    if (savedMergedDatasets) {
      try {
        setMergedDatasets(JSON.parse(savedMergedDatasets));
      } catch (e) {
        console.error("Failed to parse saved datasets:", e);
      }
    }
  }, []);
  
  // Save data when it changes
  useEffect(() => {
    try {
      localStorage.setItem("jsonProcessorEntries", JSON.stringify(processedEntries));
    } catch (e) {
      console.error("Failed to save entries to localStorage:", e);
    }
  }, [processedEntries]);
  
  useEffect(() => {
    try {
      localStorage.setItem("jsonProcessorDatasets", JSON.stringify(mergedDatasets));
    } catch (e) {
      console.error("Failed to save datasets to localStorage:", e);
    }
  }, [mergedDatasets]);
  
  // Process the next item in the queue
  useEffect(() => {
    if (isProcessingQueue && !isProcessing && processingQueue.length > 0) {
      const nextQueuedItem = processingQueue.find(item => item.status === 'queued');
      if (nextQueuedItem) {
        processJsonText(nextQueuedItem.content, nextQueuedItem.fileName, nextQueuedItem.id);
      } else {
        setIsProcessingQueue(false);
      }
    }
  }, [isProcessingQueue, isProcessing, processingQueue]);
  
  // Function to correct JSON syntax errors
  const correctJsonSyntax = useCallback((jsonStr) => {
    try {
      // First, try to parse it directly - it might be valid
      JSON.parse(jsonStr);
      return { corrected: jsonStr };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      
      // Common syntax errors to fix
      let corrected = jsonStr;
      
      // Fix 1: Missing quotes around property names
      corrected = corrected.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
      
      // Fix 2: Replace single quotes with double quotes
      corrected = corrected.replace(/'/g, '"');
      
      // Fix 3: Add missing commas between objects in arrays
      corrected = corrected.replace(/}\s*{/g, '}, {');
      
      // Fix 4: Remove trailing commas in objects and arrays
      corrected = corrected.replace(/,\s*}/g, '}');
      corrected = corrected.replace(/,\s*\]/g, ']');
      
      // Fix 5: Fix unescaped backslashes in strings
      corrected = corrected.replace(/([^\\])\\([^"\\/bfnrtu])/g, '$1\\\\$2');
      
      // Try to parse the corrected JSON
      try {
        JSON.parse(corrected);
        return { corrected };
      } catch (e2) {
        // If our automatic fixes didn't work, try a more aggressive approach
        try {
          // Try to evaluate as JavaScript object (not secure for production!)
          // This is just for the demo - in a real app, use a proper JSON repair library
          // eslint-disable-next-line no-eval
          const obj = eval(`(${jsonStr})`);
          return { corrected: JSON.stringify(obj), error: "Used aggressive correction. Verify the result!" };
        } catch (e3) {
          return { 
            corrected: jsonStr, 
            error: `Could not fix JSON. Original error: ${errorMessage}` 
          };
        }
      }
    }
  }, []);
  
  // Inspect and extract fields from JSON
  const extractFieldsFromJson = useCallback((json, prefix = '', depth = 0, maxDepth = 3) => {
    if (depth > maxDepth) return [prefix.endsWith('.') ? prefix.slice(0, -1) : prefix];
    if (json === null || json === undefined) return [];
    
    const fields = [];
    
    if (Array.isArray(json)) {
      if (processingOptions.preserveArrays || json.length === 0) {
        return [prefix.endsWith('.') ? prefix.slice(0, -1) : prefix];
      }
      
      // Sample the first few elements if it's a large array
      const sampleSize = Math.min(json.length, 3);
      const samples = json.slice(0, sampleSize);
      
      // Extract fields from each sample and merge
      const arrayFields = new Set();
      samples.forEach(item => {
        if (typeof item === 'object' && item !== null) {
          extractFieldsFromJson(item, prefix, depth + 1, maxDepth).forEach(field => {
            arrayFields.add(field);
          });
        } else {
          arrayFields.add(prefix.endsWith('.') ? prefix.slice(0, -1) : prefix);
        }
      });
      
      return Array.from(arrayFields);
    } else if (typeof json === 'object') {
      Object.keys(json).forEach(key => {
        const fullPath = prefix + key;
        
        if (typeof json[key] === 'object' && json[key] !== null) {
          fields.push(...extractFieldsFromJson(json[key], fullPath + '.', depth + 1, maxDepth));
        } else {
          fields.push(fullPath);
        }
      });
    } else {
      fields.push(prefix.endsWith('.') ? prefix.slice(0, -1) : prefix);
    }
    
    return fields;
  }, [processingOptions.preserveArrays]);
  
  // Function to format JSON with consistent structure
  const formatJsonStructure = useCallback((jsonObj) => {
    if (typeof jsonObj !== 'object' || jsonObj === null) return jsonObj;
    
    // Handle arrays
    if (Array.isArray(jsonObj)) {
      return jsonObj.map(item => formatJsonStructure(item));
    }
    
    // Order keys alphabetically and process values
    const orderedObj = {};
    Object.keys(jsonObj).sort().forEach(key => {
      let value = jsonObj[key];
      
      // Trim long string values if option is enabled
      if (processingOptions.trimLongValues && 
          typeof value === 'string' && 
          value.length > processingOptions.maxValueLength) {
        value = value.substring(0, processingOptions.maxValueLength) + '...';
      }
      
      // Recursively format nested objects
      if (typeof value === 'object' && value !== null) {
        orderedObj[key] = formatJsonStructure(value);
      } else {
        orderedObj[key] = value;
      }
    });
    
    return orderedObj;
  }, [processingOptions.trimLongValues, processingOptions.maxValueLength]);
  
  // Function to flatten nested objects for easier merging
  const flattenObject = useCallback((obj, prefix = '', result = {}, depth = 0) => {
    if (depth > processingOptions.maxDepth) {
      result[prefix.slice(0, -1)] = JSON.stringify(obj);
      return result;
    }
    
    if (typeof obj !== 'object' || obj === null) {
      result[prefix.slice(0, -1)] = obj;
      return result;
    }
    
    if (Array.isArray(obj)) {
      if (processingOptions.preserveArrays) {
        result[prefix.slice(0, -1)] = obj;
        return result;
      }
      
      if (obj.length === 0) {
        result[prefix.slice(0, -1)] = [];
        return result;
      }
      
      // Only flatten array if it contains objects
      if (typeof obj[0] === 'object' && obj[0] !== null) {
        obj.forEach((item, index) => {
          flattenObject(item, `${prefix}${index}.`, result, depth + 1);
        });
      } else {
        result[prefix.slice(0, -1)] = obj;
      }
      
      return result;
    }
    
    // Process regular objects
    Object.keys(obj).forEach(key => {
      const newKey = prefix + key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null && processingOptions.flattenNested) {
        flattenObject(obj[key], newKey + '.', result, depth + 1);
      } else {
        result[newKey] = obj[key];
      }
    });
    
    return result;
  }, [processingOptions.maxDepth, processingOptions.preserveArrays, processingOptions.flattenNested]);
  
  // Process a single JSON text input
  const processJsonText = useCallback(async (text, fileName = "unnamed.json", queueItemId) => {
    if (!text.trim()) {
      setError("Please enter JSON text to process");
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    
    // Update queue item status if it exists
    if (queueItemId) {
      setProcessingQueue(prevQueue => {
        return prevQueue.map(item => 
          item.id === queueItemId 
            ? { ...item, status: 'processing' } 
            : item
        );
      });
    }
    
    try {
      // First, try to correct any syntax errors
      const { corrected, error: correctionError } = correctJsonSyntax(text);
      
      // Parse the corrected JSON
      let parsedJson;
      try {
        parsedJson = JSON.parse(corrected);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
      
      // Format the JSON structure
      const formattedJson = processingOptions.autoFormat 
        ? formatJsonStructure(parsedJson) 
        : parsedJson;
      
      // Extract fields from the JSON
      const fields = extractFieldsFromJson(formattedJson);
      
      // Create entry
      const entry = {
        id: queueItemId || `json-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        fileName,
        originalJson: text,
        correctedJson: corrected,
        formattedJson: JSON.stringify(formattedJson, null, 2),
        error: correctionError,
        fields,
        status: correctionError ? 'warning' : 'processed',
        timestamp: new Date().toISOString()
      };
      
      // Add to processed entries
      setProcessedEntries(prev => [entry, ...prev]);
      
      // Update the queue if this was a queued item
      if (queueItemId) {
        setProcessingQueue(prevQueue => {
          return prevQueue.map(item => 
            item.id === queueItemId 
              ? { ...item, status: 'completed' } 
              : item
          );
        });
      }
      
      // Continue processing the queue if there are more items
      if (queueItemId && isProcessingQueueRef.current) {
        setIsProcessingQueue(true);
      }
      
      // Clear input if this was a direct entry (not queued)
      if (!queueItemId) {
        setJsonInputText("");
      }
      
      setActiveTab('processed');
      
      return entry;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Error processing JSON: ${errorMessage}`);
      
      // Update the queue item if it exists
      if (queueItemId) {
        setProcessingQueue(prevQueue => {
          return prevQueue.map(item => 
            item.id === queueItemId 
              ? { ...item, status: 'error', errorMessage } 
              : item
          );
        });
        
        // Continue processing the queue even if there was an error
        if (isProcessingQueueRef.current) {
          setIsProcessingQueue(true);
        }
      }
      
      // Create error entry
      const errorEntry = {
        id: queueItemId || `json-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        fileName,
        originalJson: text,
        correctedJson: text,
        formattedJson: text,
        error: errorMessage,
        fields: [],
        status: 'error',
        timestamp: new Date().toISOString()
      };
      
      setProcessedEntries(prev => [errorEntry, ...prev]);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [
    correctJsonSyntax, 
    extractFieldsFromJson, 
    formatJsonStructure, 
    processingOptions.autoFormat
  ]);
  
  // Add JSON to queue
  const addToQueue = useCallback((content, fileName) => {
    if (!content.trim()) return;
    
    const queueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      content,
      fileName,
      status: 'queued'
    };
    
    setProcessingQueue(prev => [...prev, queueItem]);
    
    // Start processing the queue if not already doing so
    if (!isProcessingQueueRef.current && !isProcessing) {
      setIsProcessingQueue(true);
    }
    
    return queueItem.id;
  }, [isProcessing]);
  
  // Handle immediate JSON processing
  const handleProcessJson = useCallback(() => {
    if (!jsonInputText.trim() || isProcessing) return;
    processJsonText(jsonInputText);
  }, [jsonInputText, isProcessing, processJsonText]);
  
  // Handle file upload
  const handleFileUpload = useCallback((event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const content = e.target?.result;
        if (typeof content === 'string') {
          addToQueue(content, file.name);
        }
      };
      
      reader.onerror = () => {
        console.error(`Error reading file ${file.name}`);
      };
      
      reader.readAsText(file);
    });
    
    // Reset input
    event.target.value = '';
  }, [addToQueue]);
  
  // Merge selected JSON entries into a dataset
  const mergeSelectedEntries = useCallback(() => {
    if (selectedEntries.size === 0) {
      setError("Please select entries to merge");
      return;
    }
    
    try {
      // Get selected entries
      const entriesToMerge = processedEntries.filter(entry => 
        selectedEntries.has(entry.id) && entry.status !== 'error'
      );
      
      if (entriesToMerge.length === 0) {
        setError("No valid entries selected for merging");
        return;
      }
      
      // Create a set of all fields from all entries
      const allFields = new Set();
      entriesToMerge.forEach(entry => {
        entry.fields.forEach(field => allFields.add(field));
      });
      
      // Convert each entry to a flattened record
      const records = [];
      
      entriesToMerge.forEach(entry => {
        try {
          const parsedJson = JSON.parse(entry.formattedJson);
          
          // Handle different types of JSON structures
          if (Array.isArray(parsedJson)) {
            // If it's an array, each element becomes a record
            parsedJson.forEach(item => {
              const record = processingOptions.flattenNested
                ? flattenObject(item)
                : item;
                
              // Add source metadata
              record._source = entry.fileName;
              record._timestamp = entry.timestamp;
              records.push(record);
            });
          } else {
            // If it's an object, it becomes a single record
            const record = processingOptions.flattenNested
              ? flattenObject(parsedJson)
              : parsedJson;
              
            // Add source metadata
            record._source = entry.fileName;
            record._timestamp = entry.timestamp;
            records.push(record);
          }
        } catch (e) {
          console.error(`Error processing entry ${entry.id}:`, e);
        }
      });
      
      // Infer schema from data
      const schema = {};
      if (processingOptions.detectSchemas && records.length > 0) {
        // Get all unique keys
        const allKeys = new Set();
        records.forEach(record => {
          Object.keys(record).forEach(key => allKeys.add(key));
        });
        
        // Determine type for each key
        allKeys.forEach(key => {
          const types = new Set();
          
          records.forEach(record => {
            if (key in record) {
              const value = record[key];
              if (value === null) {
                types.add('null');
              } else if (Array.isArray(value)) {
                types.add('array');
              } else {
                types.add(typeof value);
              }
            }
          });
          
          // Assign the most specific type
          if (types.size === 0) {
            schema[key] = 'unknown';
          } else if (types.size === 1) {
            schema[key] = Array.from(types)[0];
          } else if (types.has('string')) {
            schema[key] = 'string';
          } else if (types.has('number')) {
            schema[key] = 'number';
          } else {
            schema[key] = 'mixed';
          }
        });
      }
      
      // Create the dataset
      const dataset = {
        id: `dataset-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: `Dataset from ${entriesToMerge.length} files`,
        records,
        fields: Array.from(allFields),
        schema,
        timestamp: new Date().toISOString()
      };
      
      setMergedDatasets(prev => [dataset, ...prev]);
      setActiveDataset(dataset);
      setActiveTab('datasets');
      setSelectedEntries(new Set());
      
      return dataset;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Error merging entries: ${errorMessage}`);
      return null;
    }
  }, [
    selectedEntries, 
    processedEntries, 
    processingOptions.flattenNested, 
    processingOptions.detectSchemas,
    flattenObject
  ]);
  
  // Remove selected entries
  const removeSelectedEntries = useCallback(() => {
    if (selectedEntries.size === 0) return;
    
    if (window.confirm(`Are you sure you want to delete ${selectedEntries.size} entries?`)) {
      setProcessedEntries(prev => 
        prev.filter(entry => !selectedEntries.has(entry.id))
      );
      setSelectedEntries(new Set());
    }
  }, [selectedEntries]);
  
  // Clear processing queue
  const clearProcessingQueue = useCallback(() => {
    if (processingQueue.some(item => item.status === 'processing')) {
      if (!window.confirm("Processing is in progress. Stop and clear the queue?")) {
        return;
      }
    }
    setProcessingQueue([]);
    setIsProcessingQueue(false);
  }, [processingQueue]);
  
  // Export dataset to various formats
  const exportDataset = useCallback((dataset, format) => {
    if (!dataset) return;
    
    try {
      let content;
      let filename;
      let mimeType;
      
      switch (format) {
        case 'json':
          content = JSON.stringify(dataset.records, null, 2);
          filename = `${dataset.name.replace(/\s+/g, '-')}.json`;
          mimeType = 'application/json';
          break;
          
        case 'jsonl':
          content = dataset.records.map(record => JSON.stringify(record)).join('\n');
          filename = `${dataset.name.replace(/\s+/g, '-')}.jsonl`;
          mimeType = 'application/x-jsonlines';
          break;
          
        case 'csv':
          content = Papa.unparse(dataset.records);
          filename = `${dataset.name.replace(/\s+/g, '-')}.csv`;
          mimeType = 'text/csv';
          break;
          
        case 'huggingface':
          // Format compatible with Hugging Face datasets
          const hfDataset = {
            data: dataset.records,
            schema: dataset.schema,
            metadata: {
              name: dataset.name,
              timestamp: dataset.timestamp,
              record_count: dataset.records.length,
              fields: dataset.fields
            }
          };
          content = JSON.stringify(hfDataset, null, 2);
          filename = `${dataset.name.replace(/\s+/g, '-')}-huggingface.json`;
          mimeType = 'application/json';
          break;
          
        case 'rag':
          // Format optimized for RAG systems with text and metadata separation
          const ragRecords = dataset.records.map(record => {
            // Find content fields vs metadata fields (heuristic approach)
            const contentFields = Object.keys(record).filter(key => 
              !key.startsWith('_') && 
              typeof record[key] === 'string' && 
              record[key].length > 100
            );
            
            const metadataFields = Object.keys(record).filter(key => 
              !contentFields.includes(key)
            );
            
            // Build a RAG-friendly structure
            return {
              text: contentFields.map(field => record[field]).join('\n\n'),
              metadata: metadataFields.reduce((meta, key) => {
                meta[key] = record[key];
                return meta;
              }, {})
            };
          });
          
          content = JSON.stringify({
            name: dataset.name,
            timestamp: dataset.timestamp,
            documents: ragRecords,
            metadata: {
              record_count: dataset.records.length,
              fields: dataset.fields,
              schema: dataset.schema
            }
          }, null, 2);
          
          filename = `${dataset.name.replace(/\s+/g, '-')}-rag.json`;
          mimeType = 'application/json';
          break;
          
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
      
      // Create download
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`Error exporting dataset: ${errorMessage}`);
    }
  }, []);
  
  // Delete dataset
  const deleteDataset = useCallback((datasetId) => {
    if (window.confirm("Are you sure you want to delete this dataset?")) {
      setMergedDatasets(prev => prev.filter(ds => ds.id !== datasetId));
      if (activeDataset?.id === datasetId) {
        setActiveDataset(null);
      }
    }
  }, [activeDataset]);
  
  // Reset all data
  const resetAllData = useCallback(() => {
    if (window.confirm("Are you sure you want to delete ALL entries and datasets? This cannot be undone.")) {
      setProcessedEntries([]);
      setMergedDatasets([]);
      setActiveDataset(null);
      setSelectedEntries(new Set());
      localStorage.removeItem("jsonProcessorEntries");
      localStorage.removeItem("jsonProcessorDatasets");
    }
  }, []);
  
  // Toggle entry selection
  const toggleEntrySelection = useCallback((entryId) => {
    setSelectedEntries(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(entryId)) {
        newSelected.delete(entryId);
      } else {
        newSelected.add(entryId);
      }
      return newSelected;
    });
  }, []);
  
  // Toggle all entries selection
  const toggleAllEntriesSelection = useCallback(() => {
    if (selectedEntries.size === processedEntries.length) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(processedEntries.map(entry => entry.id)));
    }
  }, [selectedEntries, processedEntries]);
  
  // Toggle entry expansion
  const toggleEntryExpansion = useCallback((entryId) => {
    setExpandedEntry(prevExpanded => prevExpanded === entryId ? null : entryId);
  }, []);
  
  // Rows per page for pagination
  const rowsPerPage = 5;
  
  // Calculate pagination
  const totalPages = Math.ceil(processedEntries.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const visibleEntries = processedEntries.slice(startIndex, startIndex + rowsPerPage);
  
  return (
    <div className="bg-gray-50 min-h-screen py-8">
      <div className="max-w-7xl mx-auto bg-white shadow rounded-lg">
        <header className="px-6 py-4 bg-blue-700 rounded-t-lg">
          <h1 className="text-2xl font-semibold text-white text-center">
            JSON Processor for RAG Datasets
          </h1>
          <p className="text-center text-blue-100 mt-1">
            Fix, format, and merge JSON files into tabular datasets for Retrieval Augmented Generation
          </p>
        </header>

        {/* Main tabs navigation */}
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="px-6">
            <nav className="-mb-px flex space-x-6 overflow-x-auto">
              <button
                onClick={() => setActiveTab('input')}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === 'input' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
              >
                Input JSON
              </button>
              <button
                onClick={() => setActiveTab('processed')}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === 'processed' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
              >
                Processed Entries ({processedEntries.length})
              </button>
              <button
                onClick={() => setActiveTab('datasets')}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === 'datasets' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
              >
                Merged Datasets ({mergedDatasets.length})
              </button>
              <button
                onClick={() => setActiveTab('rag')}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === 'rag' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
              >
                RAG Preparation
              </button>
            </nav>
          </div>
        </div>

        <div className="p-6">
          {/* Input JSON tab */}
          {activeTab === 'input' && (
            <div>
              <div className="flex flex-col md:flex-row md:space-x-4">
                <div className="flex-1 mb-4 md:mb-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Paste JSON or upload files
                  </label>
                  <textarea
                    value={jsonInputText}
                    onChange={(e) => setJsonInputText(e.target.value)}
                    placeholder={"{\n  \"example\": \"Paste your JSON here\"\n}"}
                    rows={10}
                    disabled={isProcessing}
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md font-mono"
                  />
                </div>
                
                <div className="w-full md:w-64">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Processing Options</h3>
                    
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={processingOptions.autoFormat}
                          onChange={(e) => setProcessingOptions(prev => ({
                            ...prev,
                            autoFormat: e.target.checked
                          }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Auto-format JSON</span>
                      </label>
                      
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={processingOptions.detectSchemas}
                          onChange={(e) => setProcessingOptions(prev => ({
                            ...prev,
                            detectSchemas: e.target.checked
                          }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Detect schemas</span>
                      </label>
                      
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={processingOptions.flattenNested}
                          onChange={(e) => setProcessingOptions(prev => ({
                            ...prev,
                            flattenNested: e.target.checked
                          }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Flatten nested objects</span>
                      </label>
                      
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={processingOptions.trimLongValues}
                          onChange={(e) => setProcessingOptions(prev => ({
                            ...prev,
                            trimLongValues: e.target.checked
                          }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Trim long values</span>
                      </label>
                      
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={processingOptions.preserveArrays}
                          onChange={(e) => setProcessingOptions(prev => ({
                            ...prev,
                            preserveArrays: e.target.checked
                          }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Preserve arrays</span>
                      </label>
                      
                      <div>
                        <label htmlFor="max-depth" className="block text-xs font-medium text-gray-700">
                          Max nesting depth
                        </label>
                        <input
                          id="max-depth"
                          type="number"
                          min="1"
                          max="10"
                          value={processingOptions.maxDepth}
                          onChange={(e) => setProcessingOptions(prev => ({
                            ...prev,
                            maxDepth: parseInt(e.target.value) || 3
                          }))}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                      </div>
                      
                      <div>
                        <label htmlFor="max-value-length" className="block text-xs font-medium text-gray-700">
                          Max value length
                        </label>
                        <input
                          id="max-value-length"
                          type="number"
                          min="100"
                          step="100"
                          value={processingOptions.maxValueLength}
                          onChange={(e) => setProcessingOptions(prev => ({
                            ...prev,
                            maxValueLength: parseInt(e.target.value) || 1000
                          }))}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Upload JSON Files
                      </label>
                      <input
                        type="file"
                        accept=".json,.jsonl"
                        multiple
                        onChange={handleFileUpload}
                        className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-md file:border-0
                          file:text-sm file:font-semibold
                          file:bg-blue-50 file:text-blue-700
                          hover:file:bg-blue-100"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Processing Queue */}
              {processingQueue.length > 0 && (
                <div className="mt-6 bg-gray-50 rounded-lg border border-gray-200 p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h2 className="text-sm font-medium text-gray-700">Processing Queue ({processingQueue.length})</h2>
                    <button
                      onClick={clearProcessingQueue}
                      className="text-xs text-red-600 hover:text-red-900"
                    >
                      Clear Queue
                    </button>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {processingQueue.map(item => (
                          <tr key={item.id}>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{item.fileName}</td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                ${item.status === 'queued' ? 'bg-yellow-100 text-yellow-800' : 
                                  item.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                                  item.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  'bg-red-100 text-red-800'}`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {item.errorMessage || 
                                (item.status === 'completed' ? 'Successfully processed' : 
                                 item.status === 'processing' ? 'Processing...' : 
                                 'Waiting to be processed')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              {/* Error Display */}
              {error && (
                <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              
              <div className="mt-4 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    if (jsonInputText.trim()) {
                      addToQueue(jsonInputText, "manual-entry.json");
                      setJsonInputText("");
                    } else {
                      setError("Please enter JSON text to process");
                    }
                  }}
                  disabled={!jsonInputText.trim() || isProcessing}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  Add to Queue
                </button>
                <button
                  onClick={handleProcessJson}
                  disabled={!jsonInputText.trim() || isProcessing}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  Process Now
                </button>
              </div>
            </div>
          )}
          
          {/* Processed Entries tab */}
          {activeTab === 'processed' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Processed JSON Entries</h2>
                
                <div className="flex space-x-2">
                  <button
                    onClick={mergeSelectedEntries}
                    disabled={selectedEntries.size === 0}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
                  >
                    Merge Selected
                  </button>
                  <button
                    onClick={removeSelectedEntries}
                    disabled={selectedEntries.size === 0}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-300 disabled:cursor-not-allowed"
                  >
                    Delete Selected
                  </button>
                </div>
              </div>
              
              {processedEntries.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-gray-500">No processed entries yet. Process some JSON to see results.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={selectedEntries.size === processedEntries.length}
                                onChange={toggleAllEntriesSelection}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                              <span className="ml-2">Select All</span>
                            </label>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            File Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Field Count
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date Processed
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {visibleEntries.map(entry => (
                          <React.Fragment key={entry.id}>
                            <tr className={expandedEntry === entry.id ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={selectedEntries.has(entry.id)}
                                  onChange={() => toggleEntrySelection(entry.id)}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">{entry.fileName}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                  ${entry.status === 'processed' ? 'bg-green-100 text-green-800' : 
                                    entry.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'}`}>
                                  {entry.status === 'processed' ? 'Processed' : 
                                   entry.status === 'warning' ? 'Fixed with warnings' :
                                   'Error'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">{entry.fields.length}</td>
                              <td className="px-4 py-3 text-sm text-gray-500">
                                {new Date(entry.timestamp).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                <button
                                  onClick={() => toggleEntryExpansion(entry.id)}
                                  className="text-blue-600 hover:text-blue-900"
                                >
                                  {expandedEntry === entry.id ? 'Hide' : 'View'}
                                </button>
                              </td>
                            </tr>
                            
                            {/* Expanded view of the entry */}
                            {expandedEntry === entry.id && (
                              <tr>
                                <td colSpan={6} className="px-4 py-3 bg-blue-50">
                                  <div className="space-y-4">
                                    {/* Error/warning display */}
                                    {entry.error && (
                                      <div className={`p-3 rounded-md ${
                                        entry.status === 'warning' ? 'bg-yellow-50 border border-yellow-200' : 
                                        'bg-red-50 border border-red-200'
                                      }`}>
                                        <p className={`text-sm ${
                                          entry.status === 'warning' ? 'text-yellow-700' : 'text-red-700'
                                        }`}>
                                          {entry.error}
                                        </p>
                                      </div>
                                    )}
                                    
                                    {/* Tabs for different views */}
                                    <div className="border-b border-gray-200">
                                      <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                                        <button
                                          id={`tab-original-${entry.id}`}
                                          onClick={() => document.getElementById(`content-original-${entry.id}`)?.scrollIntoView()}
                                          className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 py-2 px-1 border-b-2 font-medium text-sm"
                                        >
                                          Original
                                        </button>
                                        <button
                                          id={`tab-corrected-${entry.id}`}
                                          onClick={() => document.getElementById(`content-corrected-${entry.id}`)?.scrollIntoView()}
                                          className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 py-2 px-1 border-b-2 font-medium text-sm"
                                        >
                                          Corrected
                                        </button>
                                        <button
                                          id={`tab-formatted-${entry.id}`}
                                          onClick={() => document.getElementById(`content-formatted-${entry.id}`)?.scrollIntoView()}
                                          className="border-blue-500 text-blue-600 py-2 px-1 border-b-2 font-medium text-sm"
                                        >
                                          Formatted
                                        </button>
                                        <button
                                          id={`tab-fields-${entry.id}`}
                                          onClick={() => document.getElementById(`content-fields-${entry.id}`)?.scrollIntoView()}
                                          className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 py-2 px-1 border-b-2 font-medium text-sm"
                                        >
                                          Fields ({entry.fields.length})
                                        </button>
                                      </nav>
                                    </div>
                                    
                                    {/* Content panels */}
                                    <div className="space-y-4">
                                      <div id={`content-formatted-${entry.id}`} className="bg-white p-3 rounded-md border border-gray-200 overflow-auto max-h-96">
                                        <pre className="text-xs text-gray-800">{entry.formattedJson}</pre>
                                      </div>
                                      <div id={`content-original-${entry.id}`} className="bg-white p-3 rounded-md border border-gray-200 overflow-auto max-h-96">
                                        <pre className="text-xs text-gray-500">{entry.originalJson}</pre>
                                      </div>
                                      <div id={`content-corrected-${entry.id}`} className="bg-white p-3 rounded-md border border-gray-200 overflow-auto max-h-96">
                                        <pre className="text-xs text-gray-600">{entry.correctedJson}</pre>
                                      </div>
                                      <div id={`content-fields-${entry.id}`} className="bg-white p-3 rounded-md border border-gray-200 overflow-auto max-h-96">
                                        <ul className="text-xs text-gray-700 space-y-1">
                                          {entry.fields.map((field, i) => (
                                            <li key={i} className="font-mono">{field}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between py-3 mt-4">
                      <div className="flex-1 flex justify-between items-center">
                        <p className="text-sm text-gray-700">
                          Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                          <span className="font-medium">
                            {Math.min(startIndex + rowsPerPage, processedEntries.length)}
                          </span>{' '}
                          of <span className="font-medium">{processedEntries.length}</span> entries
                        </p>
                        <div className="space-x-2">
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          
          {/* Merged Datasets tab */}
          {activeTab === 'datasets' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Merged Datasets</h2>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => setActiveTab('processed')}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Back to Entries
                  </button>
                </div>
              </div>
              
              {mergedDatasets.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-gray-500">No datasets created yet. Select and merge JSON entries to create a dataset.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Dataset list */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {mergedDatasets.map(dataset => (
                      <div 
                        key={dataset.id} 
                        className={`border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow
                          ${activeDataset?.id === dataset.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}`}
                      >
                        <div className="p-4 bg-white">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">{dataset.name}</h3>
                              <p className="text-xs text-gray-500 mt-1">
                                {dataset.records.length} records • {dataset.fields.length} fields
                              </p>
                            </div>
                            <button 
                              onClick={() => deleteDataset(dataset.id)}
                              className="text-gray-400 hover:text-red-500"
                              title="Delete dataset"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1">
                            {dataset.fields.slice(0, 5).map((field, i) => (
                              <span 
                                key={i}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                              >
                                {field.length > 20 ? field.substring(0, 18) + '...' : field}
                              </span>
                            ))}
                            {dataset.fields.length > 5 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                +{dataset.fields.length - 5} more
                              </span>
                            )}
                          </div>
                          <div className="mt-3 flex space-x-2 justify-end">
                            <button
                              onClick={() => exportDataset(dataset, 'json')}
                              className="text-xs text-blue-600 hover:text-blue-900"
                            >
                              JSON
                            </button>
                            <button
                              onClick={() => exportDataset(dataset, 'jsonl')}
                              className="text-xs text-blue-600 hover:text-blue-900"
                            >
                              JSONL
                            </button>
                            <button
                              onClick={() => exportDataset(dataset, 'csv')}
                              className="text-xs text-blue-600 hover:text-blue-900"
                            >
                              CSV
                            </button>
                            <button
                              onClick={() => {
                                setActiveDataset(dataset);
                                setActiveTab('rag');
                              }}
                              className="text-xs text-blue-600 hover:text-blue-900"
                            >
                              Prepare for RAG
                            </button>
                          </div>
                        </div>
                        <div 
                          onClick={() => setActiveDataset(activeDataset?.id === dataset.id ? null : dataset)}
                          className={`px-4 py-2 text-xs cursor-pointer
                            ${activeDataset?.id === dataset.id ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                        >
                          {activeDataset?.id === dataset.id ? 'Hide details' : 'View details'}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Dataset details */}
                  {activeDataset && (
                    <div className="mt-6 border rounded-lg overflow-hidden bg-white">
                      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-medium text-gray-900">{activeDataset.name} Details</h3>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => exportDataset(activeDataset, 'json')}
                              className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                            >
                              Export JSON
                            </button>
                            <button
                              onClick={() => exportDataset(activeDataset, 'csv')}
                              className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                            >
                              Export CSV
                            </button>
                            <button
                              onClick={() => setActiveTab('rag')}
                              className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                            >
                              Prepare for RAG
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="px-4 py-3">
                        <div className="flex space-x-2 mb-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                            {activeDataset.records.length} Records
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                            {activeDataset.fields.length} Fields
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                            Created {new Date(activeDataset.timestamp).toLocaleString()}
                          </span>
                        </div>
                        
                        {/* Schema information */}
                        <div className="mb-4">
                          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Schema</h4>
                          <div className="overflow-x-auto border rounded-md">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Field</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Sample</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {Object.keys(activeDataset.schema).map(field => {
                                  // Get a sample value from the first record that has this field
                                  const sampleRecord = activeDataset.records.find(r => field in r);
                                  const sampleValue = sampleRecord ? sampleRecord[field] : null;
                                  const displayValue = typeof sampleValue === 'object'
                                    ? JSON.stringify(sampleValue).substring(0, 50) + (JSON.stringify(sampleValue).length > 50 ? '...' : '')
                                    : String(sampleValue).substring(0, 50) + (String(sampleValue).length > 50 ? '...' : '');
                                  
                                  return (
                                    <tr key={field}>
                                      <td className="px-3 py-2 text-xs text-gray-900 font-mono">{field}</td>
                                      <td className="px-3 py-2 text-xs text-gray-500">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                                          ${activeDataset.schema[field] === 'string' ? 'bg-green-100 text-green-800' : 
                                            activeDataset.schema[field] === 'number' ? 'bg-blue-100 text-blue-800' :
                                            activeDataset.schema[field] === 'boolean' ? 'bg-purple-100 text-purple-800' :
                                            activeDataset.schema[field] === 'object' ? 'bg-yellow-100 text-yellow-800' :
                                            activeDataset.schema[field] === 'array' ? 'bg-pink-100 text-pink-800' :
                                            'bg-gray-100 text-gray-800'}`}>
                                          {activeDataset.schema[field]}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-xs text-gray-500 font-mono">{displayValue}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        
                        {/* Data preview */}
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Data Preview (First 5 Records)</h4>
                          <div className="overflow-x-auto border rounded-md">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  {activeDataset.records.length > 0 && Object.keys(activeDataset.records[0]).slice(0, 8).map(key => (
                                    <th key={key} className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                                      {key}
                                    </th>
                                  ))}
                                  {activeDataset.records.length > 0 && Object.keys(activeDataset.records[0]).length > 8 && (
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                                      +{Object.keys(activeDataset.records[0]).length - 8} more
                                    </th>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {activeDataset.records.slice(0, 5).map((record, i) => (
                                  <tr key={i}>
                                    {Object.entries(record).slice(0, 8).map(([key, value]) => {
                                      const displayValue = typeof value === 'object'
                                        ? JSON.stringify(value).substring(0, 30) + (JSON.stringify(value).length > 30 ? '...' : '')
                                        : String(value).substring(0, 30) + (String(value).length > 30 ? '...' : '');
                                      
                                      return (
                                        <td key={key} className="px-3 py-2 text-xs text-gray-500 font-mono whitespace-nowrap overflow-hidden text-ellipsis" style={{maxWidth: '200px'}}>
                                          {displayValue}
                                        </td>
                                      );
                                    })}
                                    {Object.keys(record).length > 8 && (
                                      <td className="px-3 py-2 text-xs text-gray-400">
                                        ...
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* RAG Preparation tab */}
          {activeTab === 'rag' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Prepare Data for RAG</h2>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => setActiveTab('datasets')}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Back to Datasets
                  </button>
                </div>
              </div>
              
              {!activeDataset ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 mb-4">No dataset selected for RAG preparation.</p>
                  <button
                    onClick={() => setActiveTab('datasets')}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Select a Dataset
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900 mb-2">RAG Dataset Preparation</h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Prepare your dataset for use in a Retrieval Augmented Generation (RAG) system by optimizing its structure and content.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-xs uppercase font-medium text-gray-500 mb-2">Dataset Information</h4>
                        <div className="bg-gray-50 p-3 rounded-md">
                          <ul className="space-y-1">
                            <li className="text-sm flex justify-between">
                              <span className="text-gray-500">Name:</span>
                              <span className="text-gray-900 font-medium">{activeDataset.name}</span>
                            </li>
                            <li className="text-sm flex justify-between">
                              <span className="text-gray-500">Records:</span>
                              <span className="text-gray-900 font-medium">{activeDataset.records.length}</span>
                            </li>
                            <li className="text-sm flex justify-between">
                              <span className="text-gray-500">Fields:</span>
                              <span className="text-gray-900 font-medium">{activeDataset.fields.length}</span>
                            </li>
                            <li className="text-sm flex justify-between">
                              <span className="text-gray-500">Created:</span>
                              <span className="text-gray-900 font-medium">{new Date(activeDataset.timestamp).toLocaleString()}</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-xs uppercase font-medium text-gray-500 mb-2">RAG Export Options</h4>
                        <div className="bg-gray-50 p-3 rounded-md">
                          <div className="space-y-3">
                            <button
                              onClick={() => exportDataset(activeDataset, 'rag')}
                              className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                            >
                              Export RAG-Ready Format
                            </button>
                            <button
                              onClick={() => exportDataset(activeDataset, 'huggingface')}
                              className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                            >
                              Export Hugging Face Format
                            </button>
                            <div className="text-xs text-gray-500 mt-1">
                              The RAG-ready format separates content from metadata and formats the data in a structure optimized for retrieval systems.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900 mb-2">RAG Structure Preview</h3>
                    
                    {/* Show sample of the RAG structure */}
                    <div className="bg-gray-50 p-3 rounded-md overflow-x-auto">
                      <pre className="text-xs text-gray-800 whitespace-pre">
{`{
  "name": "${activeDataset.name}",
  "timestamp": "${activeDataset.timestamp}",
  "documents": [
    {
      "text": "${((): string => {
        // Find a text content field in the first record for the preview
        const record = activeDataset.records[0] || {};
        const textField = Object.entries(record)
          .find(([key, value]) => 
            typeof value === 'string' && 
            value.length > 100 &&
            !key.startsWith('_')
          );
        
        if (textField) {
          return textField[1].toString().substring(0, 100) + '...';
        } else {
          return "Sample text content would appear here";
        }
      })()}",
      "metadata": {
        "source": "${activeDataset.records[0]?._source || 'document.json'}",
        "timestamp": "${activeDataset.records[0]?._timestamp || new Date().toISOString()}"${
          Object.entries(activeDataset.records[0] || {})
            .filter(([key]) => key !== '_source' && key !== '_timestamp' && !key.includes('content'))
            .slice(0, 3)
            .map(([key, value]) => `,\n        "${key}": ${JSON.stringify(value)}`)
            .join('')
        }
      }
    },
    // Additional documents would appear here
  ],
  "metadata": {
    "record_count": ${activeDataset.records.length},
    "fields": ${JSON.stringify(activeDataset.fields.slice(0, 3).concat(activeDataset.fields.length > 3 ? ['...'] : []))},
    "schema": ${JSON.stringify(
      Object.fromEntries(
        Object.entries(activeDataset.schema).slice(0, 3)
          .concat(Object.keys(activeDataset.schema).length > 3 ? [['...', '...']] : [])
      ), null, 2)}
  }
}`}
                      </pre>
                    </div>
                  </div>
                  
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">RAG Implementation Guide</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-xs uppercase font-medium text-gray-500 mb-2">1. Vector Database Setup</h4>
                        <p className="text-sm text-gray-700">
                          After exporting your data, you'll need to process it with a vector database like Pinecone, Weaviate, or Qdrant. 
                          Make sure to embed the text content using a model that matches your retrieval approach.
                        </p>
                      </div>
                      
                      <div>
                        <h4 className="text-xs uppercase font-medium text-gray-500 mb-2">2. Embedding Generation</h4>
                        <p className="text-sm text-gray-700">
                          Generate embeddings for each document's text field using models like OpenAI's text-embedding-ada-002 or 
                          Hugging Face's sentence-transformers models. The metadata will be stored alongside for context enhancement.
                        </p>
                      </div>
                      
                      <div>
                        <h4 className="text-xs uppercase font-medium text-gray-500 mb-2">3. LLM Integration</h4>
                        <p className="text-sm text-gray-700">
                          Connect your vector database to your LLM system (like OpenAI, Claude, or Llama) using a framework 
                          like LangChain or LlamaIndex to enable retrieval-augmented responses.
                        </p>
                      </div>
                      
                      <div className="text-right">
                        <button
                          onClick={() => exportDataset(activeDataset, 'rag')}
                          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                        >
                          Export RAG Dataset
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Reset all data button */}
          <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end">
            <button
              onClick={resetAllData}
              className="inline-flex items-center px-3 py-1.5 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-white hover:bg-red-50"
            >
              Reset All Data
            </button>
          </div>
        </div>
        
        <footer className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-center text-gray-500 text-sm">
          <p>JSON Processor for RAG Datasets • All data is stored locally in your browser</p>
          <p className="text-xs mt-1">Version 1.0.0</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
