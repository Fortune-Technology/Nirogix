import { redirect } from 'next/navigation';

// Entry point → the dashboard. The (app) layout bounces to /login if unauthenticated.
export default function Home() {
  redirect('/dashboard');
}
