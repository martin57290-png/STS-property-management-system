/** Small success/error banners driven by ?notice= / ?error= query params. */
export function Flash({ notice, error }: { notice?: string; error?: string }) {
  return (
    <>
      {error && (
        <div
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800"
          role="status"
        >
          {notice}
        </div>
      )}
    </>
  );
}
