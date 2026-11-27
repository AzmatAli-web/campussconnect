# Campus assistant

Open **Campus assistant** in the web sidebar or in the Flutter profile. Ask a question and open **View cited source** to read the full approved entry. Questions and replies are ephemeral in these clients. The endpoint returns a source excerpt and its reference, or an unsupported result.

In Administration, approve reviewed material with the correct audience. For a model-free FAQ, use the complete question ending in a question mark as the source title and its answer as the text. Case and punctuation are normalized. The assistant searches up to four text-ranked approved sources available to the signed-in campus member.

For questions about prose and paraphrased FAQs, configure the backend with CAMPUS_ASSISTANT_MODEL set to an installed Ollama model name and serve Ollama on loopback port 11434 alongside Express. The model selects an evidence paragraph or abstains. The backend supplies the exact text and citation. Provider failure returns a retryable service error. Keep paragraphs self-contained and review model relevance with institution-approved examples.

Run the backend db:ensure-indexes script against the intended database during release setup to create the MongoDB text index. Automated coverage uses synthetic material and a simulated model response. Pilot acceptance requires official sources and a configured model run.
