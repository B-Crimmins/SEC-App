import { useState } from 'react';
import { Modal, Stack, TextInput, Textarea, Button, Group } from '@mantine/core';
import axios from 'axios';
import globalConfig from '../../../global/globalConfig.json';

// POST /api/feedback. Backend ties the entry to the JWT user, so this
// component only owns the form fields and submission state — no email
// or identity input here.
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
    <Modal opened={opened} onClose={close} title="Send Feedback" centered>
      <Stack>
        <TextInput
          label="Title"
          placeholder="One-line summary"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          disabled={submitting}
        />
        <Textarea
          label="Description"
          placeholder="Tell us what to build next?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          autosize
          minRows={4}
          maxRows={10}
          disabled={submitting}
        />
        {error && (
          <div style={{ color: 'var(--mantine-color-red-6)', fontSize: 12 }}>{error}</div>
        )}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            Submit
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default FeedbackModal;
