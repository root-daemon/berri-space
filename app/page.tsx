import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function Home() {
  const { userId } = await auth();
  
  // Hard redirect: authenticated users go to drive, unauthenticated go to signin
  if (userId) {
    redirect('/drive');
  } else {
    redirect('/auth/signin');
  }
}
