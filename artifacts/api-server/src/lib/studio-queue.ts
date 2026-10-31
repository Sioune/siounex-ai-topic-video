// Serialize business mutations and legacy requests without forcing the public
// read service to eagerly import the old production/publishing application.
let queue: Promise<void> = Promise.resolve();
export function serializeStudioRequest<T>(callback: () => Promise<T>): Promise<T> {
  const result = queue.then(callback);
  queue = result.then(() => {}, () => {});
  return result;
}
