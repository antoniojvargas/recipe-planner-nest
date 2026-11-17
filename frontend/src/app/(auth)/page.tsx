import LoginPage from './login/page';
import RegisterPage from './register/page';

export default function AuthPage() {
  return (
    <section className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-2xl font-bold mb-6">Recipe Planner</h2>

        <div className="space-y-8">
          <LoginPage />
          <RegisterPage />
        </div>
      </div>
    </section>
  );
}