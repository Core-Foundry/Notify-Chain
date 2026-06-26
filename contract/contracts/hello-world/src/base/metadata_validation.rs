/// Notification Metadata Validation — Issue #305
///
/// Provides validation for notification metadata to ensure consistency
/// and prevent malformed data from being stored on-chain.
use crate::base::errors::Error;
use soroban_sdk::{Map, String};

/// Maximum length for metadata string fields (bytes)
const MAX_METADATA_STRING_LENGTH: u32 = 256;

/// Maximum number of metadata fields
const MAX_METADATA_FIELDS: u32 = 20;

/// Metadata associated with a scheduled notification
#[derive(Clone, Debug)]
pub struct NotificationMetadata {
    /// Required: title of the notification
    pub title: String,
    /// Optional: description or body of the notification
    pub description: Option<String>,
    /// Optional: URI or reference to additional data
    pub data_uri: Option<String>,
    /// Optional: custom key-value fields (limited)
    pub custom_fields: Option<Map<String, String>>,
}

/// Validates notification metadata
///
/// # Validation Rules
/// - `title` must be non-empty and <= MAX_METADATA_STRING_LENGTH bytes
/// - `description` if present must be <= MAX_METADATA_STRING_LENGTH bytes
/// - `data_uri` if present must be <= MAX_METADATA_STRING_LENGTH bytes
/// - `custom_fields` must not exceed MAX_METADATA_FIELDS entries
/// - All string values in custom_fields must be <= MAX_METADATA_STRING_LENGTH bytes
///
/// # Errors
/// - `InvalidInput` if title is empty
/// - `InvalidInput` if any string exceeds maximum length
/// - `InvalidInput` if custom_fields exceeds maximum field count
pub fn validate_metadata(metadata: &NotificationMetadata) -> Result<(), Error> {
    // Validate title (required)
    if metadata.title.is_empty() {
        return Err(Error::InvalidInput);
    }

    if metadata.title.len() > MAX_METADATA_STRING_LENGTH {
        return Err(Error::InvalidInput);
    }

    // Validate description if present
    if let Some(desc) = &metadata.description {
        if desc.len() > MAX_METADATA_STRING_LENGTH {
            return Err(Error::InvalidInput);
        }
    }

    // Validate data_uri if present
    if let Some(uri) = &metadata.data_uri {
        if uri.len() > MAX_METADATA_STRING_LENGTH {
            return Err(Error::InvalidInput);
        }
    }

    // Validate custom fields if present
    if let Some(fields) = &metadata.custom_fields {
        if fields.len() > MAX_METADATA_FIELDS {
            return Err(Error::InvalidInput);
        }

        // Validate each field
        for field_key in fields.keys() {
            // Validate key length
            if field_key.len() > MAX_METADATA_STRING_LENGTH {
                return Err(Error::InvalidInput);
            }

            // Validate value length
            if let Some(value) = fields.get(field_key) {
                if value.len() > MAX_METADATA_STRING_LENGTH {
                    return Err(Error::InvalidInput);
                }
            }
        }
    }

    Ok(())
}

/// Validates metadata length to prevent storage bloat
///
/// Estimates the serialized size of metadata and ensures it doesn't exceed
/// the maximum allowed size for storage efficiency.
pub fn validate_metadata_size(metadata: &NotificationMetadata) -> Result<(), Error> {
    let estimated_size = estimate_metadata_size(metadata);

    // Maximum metadata size: 4KB
    const MAX_METADATA_SIZE: u32 = 4096;

    if estimated_size > MAX_METADATA_SIZE {
        return Err(Error::InvalidInput);
    }

    Ok(())
}

/// Estimates the serialized size of metadata
fn estimate_metadata_size(metadata: &NotificationMetadata) -> u32 {
    let mut size: u32 = 0;

    // Title
    size += metadata.title.len() as u32;

    // Description
    if let Some(desc) = &metadata.description {
        size += desc.len() as u32;
    }

    // Data URI
    if let Some(uri) = &metadata.data_uri {
        size += uri.len() as u32;
    }

    // Custom fields
    if let Some(fields) = &metadata.custom_fields {
        for field_key in fields.keys() {
            size += field_key.len() as u32;
            if let Some(value) = fields.get(field_key) {
                size += value.len() as u32;
            }
        }
    }

    size
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_metadata() {
        let metadata = NotificationMetadata {
            title: String::from_slice(&soroban_sdk::Env::default(), "Test"),
            description: None,
            data_uri: None,
            custom_fields: None,
        };
        assert!(validate_metadata(&metadata).is_ok());
    }

    #[test]
    fn test_empty_title_invalid() {
        let metadata = NotificationMetadata {
            title: String::from_slice(&soroban_sdk::Env::default(), ""),
            description: None,
            data_uri: None,
            custom_fields: None,
        };
        assert!(validate_metadata(&metadata).is_err());
    }

    #[test]
    fn test_long_title_invalid() {
        let env = soroban_sdk::Env::default();
        let long_string =
            String::from_slice(&env, &"a".repeat(MAX_METADATA_STRING_LENGTH as usize + 1));
        let metadata = NotificationMetadata {
            title: long_string,
            description: None,
            data_uri: None,
            custom_fields: None,
        };
        assert!(validate_metadata(&metadata).is_err());
    }
}
