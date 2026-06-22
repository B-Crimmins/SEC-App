import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { IconSearch } from '@tabler/icons-react';
import globalConfig from '../../global/globalConfig.json';
import { Button } from '../../src/components/ui/button';
import { Card, CardContent, CardHeader } from '../../src/components/ui/card';
import { Input } from '../../src/components/ui/input';
import { Label } from '../../src/components/ui/label';
import { Checkbox } from '../../src/components/ui/checkbox';
import { Separator } from '../../src/components/ui/separator';

function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
  });
  const navigate = useNavigate();

  const handleLogin = () => {
    axios
      .post(globalConfig.appUrl + '/auth/login', loginForm, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((x) => {
        sessionStorage.setItem('token', x.data.access_token);
        sessionStorage.setItem('user', JSON.stringify(x.data.user));
        navigate('/AppHome');
      });
  };

  const handleChange = (e) => {
    setLoginForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconSearch size={22} strokeWidth={2.2} className="text-accent" />
            <h2 className="text-lg font-semibold">Login to Intrinsiq</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">Please login or register below</span>
            <Separator className="flex-1" />
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="username">Email</Label>
              <Input
                id="username"
                name="username"
                type="email"
                required
                placeholder="you@example.com"
                onChange={handleChange}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                placeholder="Your password"
                onChange={handleChange}
              />
            </div>

            {isRegister && (
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  placeholder="Confirm password"
                  onChange={handleChange}
                />
              </div>
            )}

            {isRegister && (
              <div className="flex items-center gap-2">
                <Checkbox checked={accepted} onCheckedChange={setAccepted} id="terms" />
                <Label htmlFor="terms" className="cursor-pointer" onClick={() => setAccepted(!accepted)}>
                  I accept terms and conditions
                </Label>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                onClick={() => setIsRegister(!isRegister)}
              >
                {isRegister ? 'I have an account' : 'Register'}
              </button>
              <Button type="submit" className="rounded-full px-6">
                {isRegister ? 'Register' : 'Login'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default LoginPage;
