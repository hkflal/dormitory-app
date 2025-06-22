import { useState } from 'react';
import Head from 'next/head';

export default function DataUpdatePage() {
  const [file, setFile] = useState(null);
  const [unknownCols, setUnknownCols] = useState([]);
  const [status, setStatus] = useState('idle');
  const [logs, setLogs] = useState('');

  const handleFileChange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    const form = new FormData();
    form.append('file', f);
    setStatus('checking');
    const res = await fetch('/api/preview-columns', { method: 'POST', body: form });
    const json = await res.json();
    setUnknownCols(json.unknown || []);
    setStatus(json.status);
  };

  const runUpdate = async () => {
    if (!file) return;
    setStatus('updating');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/run-update', { method: 'POST', body: form });
    const json = await res.json();
    setLogs(json.logs);
    setStatus(json.exitCode === 0 ? 'done' : 'error');
  };

  return (
    <div className="p-8">
      <Head>
        <title>Data Update</title>
      </Head>
      <h1 className="text-2xl font-bold mb-4">Data Update Utility</h1>

      <input type="file" accept=".xlsx" onChange={handleFileChange} className="mb-4" />

      {status === 'checking' && <p>Checking columns…</p>}

      {status === 'identical' && (
        <div>
          <p className="text-green-600 mb-2">Columns match expected schema.</p>
          <button onClick={runUpdate} className="px-4 py-2 bg-blue-600 text-white rounded">Run Update</button>
        </div>
      )}

      {status === 'unknown-columns' && (
        <div>
          <p className="text-yellow-600 font-semibold">Unknown columns detected:</p>
          <ul className="list-disc list-inside mb-4">
            {unknownCols.map(c => <li key={c}>{c}</li>)}
          </ul>
          <p className="text-sm">Please update the server-side pipeline to handle these columns before running an update.</p>
        </div>
      )}

      {status === 'updating' && <p>Updating… check server logs.</p>}
      {status === 'done' && (
        <div>
          <p className="text-green-600">Update finished successfully.</p>
          <pre className="mt-4 p-2 bg-gray-100 whitespace-pre-wrap text-xs max-h-96 overflow-auto">{logs}</pre>
        </div>
      )}
      {status === 'error' && (
        <div>
          <p className="text-red-600">Update failed.</p>
          <pre className="mt-4 p-2 bg-gray-100 whitespace-pre-wrap text-xs max-h-96 overflow-auto">{logs}</pre>
        </div>
      )}
    </div>
  );
} 