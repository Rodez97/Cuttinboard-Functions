export function parseStoragePathFromUrl(url: string) {
  // Parse the URL to extract the path and query string
  const urlObj = new URL(url);

  // Get the path and remove the leading "/v0/b/" from it
  const path = urlObj.pathname.slice("/v0/b/".length);

  // Replace URL encoding in the path
  const decodedPath = decodeURIComponent(path.replace(/\+/g, " "));

  // Remove the bucket name from the path
  const pathWithoutBucket = decodedPath.split("/").slice(2).join("/");

  // Extract the query parameters
  const queryParams = urlObj.searchParams;

  // Get the "alt" parameter value
  const altParam = queryParams.get("alt");

  // Get the "token" parameter value
  const tokenParam = queryParams.get("token");

  return {
    path: pathWithoutBucket,
    alt: altParam,
    token: tokenParam,
  };
}
