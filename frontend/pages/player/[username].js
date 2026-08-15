import { useEffect } from 'react';
import { useRouter } from 'next/router';
export default function PlayerRedirect() {
  const router = useRouter();
  const { username } = router.query;
  useEffect(() => { if (username) router.replace(`/profile/${username}`); }, [username]);
  return null;
}
