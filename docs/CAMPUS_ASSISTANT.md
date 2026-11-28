# Campus assistant

Open **Campus assistant** in the web sidebar or in the Flutter profile. Ask a question and open **View cited source** to read the full approved entry. Questions and replies are ephemeral in these clients. The endpoint returns a source excerpt and its reference, or an unsupported result.

In Administration, approve reviewed material with the correct audience. For a model-free FAQ, use the complete question ending in a question mark as the source title and its answer as the text. Case and punctuation are normalized. The assistant searches up to four text-ranked approved sources available to the signed-in campus member.

For questions about prose and paraphrased FAQs, configure the backend with CAMPUS_ASSISTANT_MODEL set to an installed Ollama model name and serve Ollama on loopback port 11434 alongside Express. The model selects an evidence paragraph or abstains. The backend supplies the exact text and citation. Provider failure returns a retryable service error. Keep paragraphs self-contained and review model relevance with institution-approved examples.

Run the backend db:ensure-indexes script against the intended database during release setup to create the MongoDB text index. Automated coverage uses synthetic material and a simulated model response. Pilot acceptance requires official sources and a configured model run.

## Pilot evaluation

Run `npm run qa:assistant` from backend after installing dependencies. The evaluator starts an isolated MongoDB, uses a fixture student identity and calls the same Express answer and citation routes as both clients. The public library and campus directory pages are linked in the fixture corpus. Restricted, withdrawn and foreign-campus entries contain invented data. Nothing is imported into a campus database.

The **Campus assistant evaluation** workflow compares FAQ-only mode with a local Ollama model on the same 11 questions. Four cover exact FAQs, two ask for the same facts in different words, two request unavailable details and three test access boundaries. Relevance and citations use all six answerable questions as the denominator. Abstention uses the five negative cases. HTTP errors count as failures. The workflow publishes per-case JSON so reviewers can inspect misses. This small evaluation measures the listed facts and audiences. Campus approval, student usability and staging acceptance remain separate.
