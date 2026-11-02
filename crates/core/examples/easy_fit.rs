use std::io::{self, Read};
use zari_core::easy_fit::{EasyFitInput, evaluate_easy_fit};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut text = String::new();
    io::stdin().read_to_string(&mut text)?;
    let inputs: Vec<EasyFitInput> = serde_json::from_str(&text)?;
    let results: Vec<_> = inputs.iter().map(evaluate_easy_fit).collect();
    println!("{}", serde_json::to_string(&results)?);
    Ok(())
}
