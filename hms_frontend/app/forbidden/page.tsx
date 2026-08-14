import { Forbidden } from "../../components/Forbidden";

// Standalone 403 route for direct hits / redirects.
export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen bg-bg">
      <Forbidden />
    </div>
  );
}
