/**
 * Shared query-parameter validation for the events API (#646).
 *
 * One policy for every endpoint:
 *  - Unknown parameter names are rejected with UNSUPPORTED_QUERY_PARAMETER.
 *  - Malformed values (non-integer limits, bad dates, values outside an
 *    enum) are rejected with INVALID_QUERY_PARAMETER.
 *  - Absent parameters stay undefined so handlers keep their defaults.
 *
 * Both cases surface as a structured 400 through sendErr with details
 * { parameter, code, supportedParameters }.
 */

export interface QueryParamSpec {
  type: 'string' | 'integer' | 'boolean' | 'date';
  /** Allowed values for type 'string' (enum). */
  values?: readonly string[];
  /** Inclusive bounds for type 'integer'. */
  min?: number;
  max?: number;
  /** Max length for type 'string'. */
  maxLength?: number;
}

export type QueryValue = string | number | boolean | undefined;

export interface QueryValidationOk {
  ok: true;
  values: Record<string, QueryValue>;
}

export interface QueryValidationError {
  ok: false;
  code: 'INVALID_QUERY_PARAMETER' | 'UNSUPPORTED_QUERY_PARAMETER';
  parameter: string;
  message: string;
  supportedParameters: string[];
}

export type QueryValidationResult = QueryValidationOk | QueryValidationError;

export function validateQueryParams(
  searchParams: URLSearchParams,
  spec: Record<string, QueryParamSpec>
): QueryValidationResult {
  const supportedParameters = Object.keys(spec);

  for (const key of searchParams.keys()) {
    if (!supportedParameters.includes(key)) {
      return {
        ok: false,
        code: 'UNSUPPORTED_QUERY_PARAMETER',
        parameter: key,
        message: `Unsupported query parameter '${key}'. Supported parameters: ${supportedParameters.join(', ')}.`,
        supportedParameters,
      };
    }
  }

  const values: Record<string, QueryValue> = {};

  for (const [name, paramSpec] of Object.entries(spec)) {
    const raw = searchParams.get(name);
    if (raw === null) {
      values[name] = undefined;
      continue;
    }

    switch (paramSpec.type) {
      case 'integer': {
        if (!/^-?\d+$/.test(raw)) {
          return invalid(name, `Query parameter '${name}' must be an integer, received '${raw}'.`, supportedParameters);
        }
        const parsed = parseInt(raw, 10);
        if (paramSpec.min !== undefined && parsed < paramSpec.min) {
          return invalid(name, `Query parameter '${name}' must be >= ${paramSpec.min}, received ${parsed}.`, supportedParameters);
        }
        if (paramSpec.max !== undefined && parsed > paramSpec.max) {
          return invalid(name, `Query parameter '${name}' must be <= ${paramSpec.max}, received ${parsed}.`, supportedParameters);
        }
        values[name] = parsed;
        break;
      }
      case 'boolean': {
        if (raw !== 'true' && raw !== 'false') {
          return invalid(name, `Query parameter '${name}' must be 'true' or 'false', received '${raw}'.`, supportedParameters);
        }
        values[name] = raw === 'true';
        break;
      }
      case 'date': {
        const parsed = new Date(raw);
        if (isNaN(parsed.getTime())) {
          return invalid(name, `Query parameter '${name}' must be a valid ISO date, received '${raw}'.`, supportedParameters);
        }
        values[name] = raw;
        break;
      }
      case 'string': {
        if (paramSpec.maxLength !== undefined && raw.length > paramSpec.maxLength) {
          return invalid(name, `Query parameter '${name}' must be at most ${paramSpec.maxLength} characters.`, supportedParameters);
        }
        if (paramSpec.values && !paramSpec.values.includes(raw)) {
          return invalid(name, `Query parameter '${name}' must be one of: ${paramSpec.values.join(', ')}. Received '${raw}'.`, supportedParameters);
        }
        values[name] = raw;
        break;
      }
    }
  }

  return { ok: true, values };
}

function invalid(
  parameter: string,
  message: string,
  supportedParameters: string[]
): QueryValidationError {
  return { ok: false, code: 'INVALID_QUERY_PARAMETER', parameter, message, supportedParameters };
}
