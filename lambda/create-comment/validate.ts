export interface CommentInput {
  postSlug: string;
  authorName: string;
  body: string;
  parentId?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateCommentInput(data: unknown): ValidationResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const { postSlug, authorName, body } = data as Record<string, unknown>;

  if (!postSlug || typeof postSlug !== 'string' || postSlug.trim() === '') {
    return { valid: false, error: 'postSlug is required and must be a non-empty string' };
  }

  if (!authorName || typeof authorName !== 'string' || authorName.trim() === '') {
    return { valid: false, error: 'authorName is required and must be a non-empty string' };
  }

  if (!body || typeof body !== 'string' || body.trim() === '') {
    return { valid: false, error: 'body is required and must be a non-empty string' };
  }

  const { parentId } = data as Record<string, unknown>;
  if (parentId !== undefined && (typeof parentId !== 'string' || parentId.trim() === '')) {
    return { valid: false, error: 'parentId must be a non-empty string if provided' };
  }

  return { valid: true };
}
