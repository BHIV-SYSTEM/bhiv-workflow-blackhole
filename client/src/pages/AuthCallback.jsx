import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/auth-context';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');
    const error = searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      navigate('/login?error=Authentication failed. Please try again.');
      return;
    }

    if (token && userParam) {
      try {
        const user = JSON.parse(decodeURIComponent(userParam));
        
        // Store in localStorage
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        
        // Update auth context if available
        if (setUser) {
          setUser(user);
        }

        // Redirect based on role
        if (user.role === 'Admin') {
          navigate('/admindashboard');
        } else if (user.role === 'Manager') {
          navigate('/dashboard');
        } else if (user.role === 'Procurement Agent') {
          navigate('/procurement-dashboard');
        } else {
          navigate('/dashboard');
        }
      } catch (error) {
        console.error('Error processing OAuth callback:', error);
        navigate('/login?error=Authentication failed. Please try again.');
      }
    } else {
      navigate('/login?error=Authentication failed. Please try again.');
    }
  }, [searchParams, navigate, setUser]);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Signing you in...</h2>
        <p className="text-muted-foreground">Please wait while we complete the authentication.</p>
      </div>
    </div>
  );
}
