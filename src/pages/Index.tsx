import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const { isAuthenticated, role, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (role === null) {
      return;
    }

    console.log('ROLE:', role);

    if (role === 'admin') {
      navigate('/');
    } else {
      navigate('/cliente');
    }
  }, [isAuthenticated, isLoading, role, navigate]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  if (role === null) {
    return <div>Loading role...</div>;
  }

  return null;
};

export default Index;
