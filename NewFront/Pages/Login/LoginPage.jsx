import { useState } from 'react'
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
  useMantineColorScheme
} from '@mantine/core';
import axios from 'axios'
import { useNavigate } from 'react-router-dom';
import globalConfig from '../../global/globalConfig.json'
import { useForm } from '@mantine/form';
import { upperFirst, useToggle } from '@mantine/hooks';

function LoginPage() {
  const [count, setCount] = useState(0)
  const [isRegister, setIsRegister] = useState(false);
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  })
  const navigate = useNavigate();

  const {setColorScheme, clearColorScheme} = useMantineColorScheme();

  const handleLogin = () => {
    //Do some ajax stuff here
    console.log("click");
    axios.post(globalConfig.appUrl + '/auth/login', loginForm, {
      headers:{
        'Content-Type': 'multipart/form-data'
      }
    }).then((x) => {
      console.log(x.data);
      sessionStorage.setItem('token', x.data.access_token);
      sessionStorage.setItem('user', JSON.stringify(x.data.user))
      navigate('/AppHome')
    })    
  }

  const handleChange = (e) => {
    setLoginForm(prevData => {
      return { ...prevData, [e.target.name]: e.target.value}
    })
  }

  const handleRegisterClick = () => {
    setIsRegister(!isRegister);
  }

  return (
    <>
      <Container size={500} my={100}>
        <Paper radius="md" p="lg" withBorder>
          <Text size="lg" fw={500}>
            Welcome to SEC-Wrapper
          </Text>
          <Divider label="Please login or register below" labelPosition="center" my="lg" />
          <Stack>
            {/* <TextInput
              label="Name"
              placeholder="Your name"
              //value={form.values.name}
              //onChange={(event) => form.setFieldValue('name', event.currentTarget.value)}
              radius="md"
            /> */}
            <TextInput
              required
              label="Email"
              placeholder="hello@mantine.dev"
              onChange={handleChange}
              name='username'
              //value={form.values.email}
              //onChange={(event) => form.setFieldValue('email', event.currentTarget.value)}
              //error={form.errors.email && 'Invalid email'}
              radius="md"
            />
            <PasswordInput
              required
              label="Password"
              placeholder="Your password"
              onChange={handleChange}
              name='password'
              //value={form.values.password}
              //onChange={(event) => form.setFieldValue('password', event.currentTarget.value)}
              //error={form.errors.password && 'Password should include at least 6 characters'}
              radius="md"
            />
            {isRegister &&
              <PasswordInput
                required
                label="Confirm Password"
                placeholder="Confirm password"
                onChange={handleChange}
                name='confirmPassword'
                //value={form.values.password}
                //onChange={(event) => form.setFieldValue('password', event.currentTarget.value)}
                //error={form.errors.password && 'Password should include at least 6 characters'}
                radius="md"
              />
            }

            {isRegister &&
              <Checkbox
                label="I accept terms and conditions"
              //checked={form.values.terms}
              //onChange={(event) => form.setFieldValue('terms', event.currentTarget.checked)}
              />
            }

          </Stack>
          <Group justify="space-between" mt="xl">
            <Anchor
              component="button"
              type="button"
              c="dimmed"
              onClick={handleRegisterClick} size="xs">
              {isRegister ? "I have an account" : "Register"}
            </Anchor>
            <Button
              type="submit"
              radius="xl"
              onClick={handleLogin}
              >
              {isRegister ? "Register" : "Login"}
            </Button>            
          </Group>
        </Paper>
      </Container>
    </>
  )
}

export default LoginPage
