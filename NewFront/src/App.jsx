import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import {
  Anchor,
  Button,
  Checkbox,
  Container,
  Divider,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { upperFirst, useToggle } from '@mantine/hooks';

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <Container size={500} my={200}>
        <Paper radius="md" p="lg" withBorder>
          <Text size="lg" fw={500}>
            Welcome to Mantine
          </Text>
          <Divider label="Or continue with email" labelPosition="center" my="lg" />
          <Stack>
            <TextInput
              label="Name"
              placeholder="Your name"
              //value={form.values.name}
              //onChange={(event) => form.setFieldValue('name', event.currentTarget.value)}
              radius="md"
            />
            <TextInput
              required
              label="Email"
              placeholder="hello@mantine.dev"
              //value={form.values.email}
              //onChange={(event) => form.setFieldValue('email', event.currentTarget.value)}
              //error={form.errors.email && 'Invalid email'}
              radius="md"
            />
            <PasswordInput
              required
              label="Password"
              placeholder="Your password"
              //value={form.values.password}
              //onChange={(event) => form.setFieldValue('password', event.currentTarget.value)}
              //error={form.errors.password && 'Password should include at least 6 characters'}
              radius="md"
            />
            <Checkbox
              label="I accept terms and conditions"
            //checked={form.values.terms}
            //onChange={(event) => form.setFieldValue('terms', event.currentTarget.checked)}
            />
          </Stack>
          <Group justify="space-between" mt="xl">
            <Anchor component="button" type="button" c="dimmed" onClick={() => toggle()} size="xs">
              Register
            </Anchor>
            <Button type="submit" radius="xl">
              Login
            </Button>
          </Group>
        </Paper>
      </Container>
    </>
  )
}

export default App
