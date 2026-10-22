// Calls the Python core (api/simulate.py on Vercel, dev_server.py locally).
async function post(payload) {
  let res;
  try {
    res = await fetch('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    return { ok: false, errors: ['Could not reach the Python simulation API. Run "python dev_server.py" locally, or deploy to Vercel.'] };
  }
  try { return await res.json(); }
  catch { return { ok: false, errors: [`The simulation API returned an unexpected response (HTTP ${res.status}).`] }; }
}
export const simulate = (module, algorithm, input) => post({ module, algorithm, input });
export const compare = (module, algorithms, input) => post({ module, algorithms, input });
