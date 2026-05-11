import axios from 'axios';
import globalConfig from '../../../../global/globalConfig.json';

const base = () => globalConfig.appUrl + '/api/ffiec';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + sessionStorage.getItem('token'),
});

export async function getSchema() {
  const { data } = await axios.get(base() + '/schema', { headers: authHeaders() });
  return data;
}

// Distinct values for a single column, optionally scoped by other filters.
// The backend excludes `column` from its own filter set so narrowing one
// dropdown never hides its own selected value.
export async function getDistinct(column, filters = {}, limit = 50000) {
  const { data } = await axios.post(
    base() + '/distinct',
    { column, filters, limit },
    { headers: authHeaders() }
  );
  return data.values;
}

// spec: { dimensions, measures, filters, order_by, limit }
export async function runQuery(spec) {
  const { data } = await axios.post(base() + '/query', spec, { headers: authHeaders() });
  return data;
}
