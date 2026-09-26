import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, ShieldCheck } from 'lucide-react';
import { api, apiErrorMessage } from '../services/api';
import { Button, Card, Spinner } from '../components/ui';

export default function PublicSharePage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  async function download() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/share/${token}`, { responseType: 'blob' });
      const disposition = res.headers['content-disposition'] as string | undefined;
      const match = disposition?.match(/filename="?([^"]+)"?/);
      const filename = match ? decodeURIComponent(match[1]) : 'download';

      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <Card className="w-full max-w-md text-center">
        <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-brand-600" />
        <h1 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">Shared file</h1>
        <p className="mb-6 text-sm text-gray-500">
          This file was securely shared with you. It will be decrypted and downloaded to your device.
        </p>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {downloaded ? (
          <p className="text-sm text-green-600">Download started.</p>
        ) : (
          <Button className="w-full" onClick={download} disabled={loading}>
            {loading ? <Spinner /> : <Download className="h-4 w-4" />}
            {loading ? 'Preparing download...' : 'Download file'}
          </Button>
        )}
      </Card>
    </div>
  );
}
