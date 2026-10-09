pub mod canonical;
pub mod catalog;
pub mod catalog_provenance;
pub mod completion;
pub mod edit;
pub mod eligibility;
pub mod eval_continue;
pub mod facts;
pub mod finalize;
pub mod geometry;
pub mod incremental;
pub mod input;
pub mod inventory;
pub mod measurement;
pub mod next_facts;
pub mod normalize;
pub mod offer_bundles;
pub mod pareto;
pub mod plan;
pub mod probe;
pub mod protocol;
pub mod raw;
pub mod scalars;
pub mod spatial_view;
pub mod strategy;
pub mod strategy_library;
pub mod validate;
pub mod validator;
pub use canonical::*;
pub use catalog::*;
pub use completion::*;
pub use edit::*;
pub use eligibility::{
    ActionEligibilityReply, ActionEligibilityRow, ActionEligibilityStamp, ActionProgressInput,
    EligibilityError, InstanceRef, ProgressMark, progress_identity, query_action_eligibility,
};
pub use facts::*;
pub use finalize::{CandidateEvaluation, assemble_action_guide, evaluate_candidate};
pub use input::*;
pub use measurement::*;
pub use next_facts::{
    NextFactRow, NextFactsError, NextFactsFreshness, NextFactsReply, NextFactsSourceStamp,
    ResolutionAction, query_next_facts,
};
pub use normalize::*;
pub use plan::*;
pub use probe::*;
pub use protocol::*;
pub use raw::*;
pub use spatial_view::*;
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
