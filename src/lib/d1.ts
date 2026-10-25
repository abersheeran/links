export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && /UNIQUE constraint failed/iu.test(error.message)
  );
}
