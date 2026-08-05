import { useState } from 'react';
import axios from 'axios';
import globalConfig from '../../../global/globalConfig.json';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../src/components/ui/dialog';
import { Input } from '../../../src/components/ui/input';
import { Textarea } from '../../../src/components/ui/textarea';
import { Label } from '../../../src/components/ui/label';
import { Button } from '../../../src/components/ui/button';
import { Spinner } from '../../../src/components/ui/spinner';

const FeedbackModal = ({ opened, onClose }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const close = () => {
    if (submitting) return;
    setTitle('');
    setDescription('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      setError('Both title and description are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await axios.post(
        globalConfig.appUrl + '/api/feedback',
        { title: t, description: d },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + sessionStorage.getItem('token'),
          },
        }
      );
      setTitle('');
      setDescription('');
      onClose();
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="feedback-title">Title</Label>
            <Input
              id="feedback-title"
              placeholder="One-line summary"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feedback-desc">Description</Label>
            <Textarea
              id="feedback-desc"
              placeholder="Tell us what to build next?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              disabled={submitting}
            />
          </div>
          {error && <div className="text-xs text-loss">{error}</div>}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={close} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Spinner size="sm" className="mr-1.5" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackModal;
