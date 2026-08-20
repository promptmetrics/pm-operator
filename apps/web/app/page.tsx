import { permanentRedirect } from 'next/navigation';

// 308, not 307: GSC classified /feed as "Duplicate without user-selected
// canonical" because the temporary redirect told Google `/` was still the real
// URL. Replace with a public landing page when the content team's copy lands.
export default function HomePage() {
  permanentRedirect('/feed');
}
