import { spawn } from 'child_process';
import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const form = formidable({ multiples: false });
  const { fields, files } = await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });

  const file = files.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const tempPath = file[0].filepath || file.filepath || file.path;

  const out = [];
  const proc = spawn('node', ['scripts/update-from-xlsx.js', '--file', tempPath], {
    cwd: process.cwd(),
  });
  proc.stdout.on('data', d => out.push(d.toString()));
  proc.stderr.on('data', d => out.push(d.toString()));
  proc.on('close', code => {
    res.json({ exitCode: code, logs: out.join('') });
  });
} 