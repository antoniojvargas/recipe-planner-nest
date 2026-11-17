import LoginPage from './login/page';
import RegisterPage from './register/page';
import { Header } from './header';
import CreateHouseholdPage from './create-household/page';
import JoinPage from './join/page';
import InvitePage from './invite/page';

export default function AuthPage() {
  // En un implementation real, currentHome viene del estado o del router
  // Por ahora, usamos un ID fijo o null si no hay hogar
  const currentHomeId = null;

  return (
    <section className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-2xl font-bold mb-6">Recipe Planner</h2>

        <Header />

        <div className="space-y-8">
          <LoginPage />
          <RegisterPage />
          <CreateHouseholdPage />
          {currentHomeId && <InvitePage homeId={currentHomeId} />}
          <JoinPage />
        </div>
      </div>
    </section>
  );
}