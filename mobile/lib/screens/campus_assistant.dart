import 'package:material_ui/material_ui.dart';
import '../models/campus_models.dart';
import '../services/campus_api.dart';

class CampusAssistant extends StatefulWidget {
  final CampusApi api;
  const CampusAssistant({super.key, required this.api});

  @override
  State<CampusAssistant> createState() => _CampusAssistantState();
}

class _CampusAssistantState extends State<CampusAssistant> {
  String question = '', error = '';
  Json? answer, source;
  bool busy = false;

  Future<void> submit({bool citation = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
      source = null;
      if (!citation) answer = null;
    });
    try {
      if (citation) {
        final result = await widget.api.citedSource(asJson(answer!['citation'])['id'] as String);
        if (mounted) setState(() => source = result);
      } else {
        final result = await widget.api.askCampus(question.trim());
        if (mounted) setState(() => answer = result);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          if (e is CampusApiException && (e.statusCode == 403 || e.statusCode == 404)) answer = null;
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final citation = answer?['citation'];
    return Scaffold(appBar: AppBar(title: const Text('Campus assistant')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(enabled: !busy, maxLength: 400, maxLines: 3,
          decoration: const InputDecoration(labelText: 'Ask about campus'),
          onChanged: (value) => setState(() {question = value; answer = null; source = null; error = ''; })),
        FilledButton(onPressed: busy || question.trim().length < 3 ? null : () => submit(),
          child: const Text('Ask assistant')),
        if (busy) const LinearProgressIndicator(),
        if (error.isNotEmpty) Text(error),
        if (answer?['status'] == 'unsupported') const Text('I couldn’t find an approved source that answers this question.'),
        if (citation is Map) ...[
          SelectableText(answer!['answer'] as String),
          Text("${citation['title']} · ${citation['reference']}"),
          TextButton(onPressed: busy ? null : () => submit(citation: true), child: const Text('View cited source')),
        ],
        if (source != null) SelectableText(source!['text'] as String),
      ]));
  }
}
