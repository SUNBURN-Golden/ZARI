use std::io::{self, Read};
use zari_core::space_fit::{SpaceFitInput, SpaceFitSearch};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut text = String::new();
    io::stdin()
        .take(4 * 1024 * 1024 + 1)
        .read_to_string(&mut text)?;
    if text.len() > 4 * 1024 * 1024 {
        return Err("space_input_too_large".into());
    }
    let input: SpaceFitInput = serde_json::from_str(&text)?;
    let mut search = SpaceFitSearch::new(input)?;
    let pages: Vec<_> = (0..3).map(|_| search.step(1000)).collect();
    println!("{}", serde_json::to_string(&pages)?);
    Ok(())
}
