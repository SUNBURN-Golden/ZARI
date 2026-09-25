pub mod canonical;
pub mod catalog;
pub mod edit;
pub mod facts;
pub mod finalize;
pub mod geometry;
pub mod input;
pub mod normalize;
pub mod plan;
pub mod probe;
pub mod protocol;
pub mod raw;
pub mod scalars;
pub mod strategy;
pub mod validate;
pub mod validator;
pub use canonical::*;
pub use catalog::*;
pub use edit::*;
pub use facts::*;
pub use finalize::{CandidateEvaluation, evaluate_candidate};
pub use input::*;
pub use normalize::*;
pub use plan::*;
pub use probe::*;
pub use protocol::*;
pub use raw::*;
pub use strategy::*;
pub use validator::{CandidateValidation, has_blocking_failure, validate_candidate};

pub fn required_option<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    <Option<T> as serde::Deserialize>::deserialize(deserializer)
}

/// A JSON-schema-only marker: key presence is required, but JSON null is legal.
/// Rust decoding separately enforces presence via `required_option`.
pub struct RequiredNullable<T>(std::marker::PhantomData<T>);
impl<T: schemars::JsonSchema> schemars::JsonSchema for RequiredNullable<T> {
    fn inline_schema() -> bool {
        true
    }
    fn schema_name() -> std::borrow::Cow<'static, str> {
        format!("RequiredNullable_{}", T::schema_name()).into()
    }
    fn json_schema(generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
        <Option<T> as schemars::JsonSchema>::json_schema(generator)
    }
}
