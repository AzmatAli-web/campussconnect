import 'package:material_ui/material_ui.dart';
import 'package:uuid/uuid.dart';
import '../models/campus_models.dart';
import '../services/campus_api.dart';

class MessagesScreen extends StatefulWidget {
  final CampusApi api;
  final Json? thread;
  const MessagesScreen({super.key, required this.api, this.thread});

  @override
  State<MessagesScreen> createState() => _MessagesState();
}

class _MessagesState extends State<MessagesScreen> {
  final draft = TextEditingController();
  List<Json> rows = [];
  bool busy = false, more = false;
  String error = '', notice = '';
  String? attemptedText, clientId;
  String? get threadId => widget.thread?['id'] as String?;

  @override
  void initState() {
    super.initState();
    run(() => load());
  }

  @override
  void dispose() {
    draft.dispose();
    super.dispose();
  }

  Future<void> run(Future<void> Function() work) async {
    if (busy) return;
    setState(() { busy = true; error = ''; notice = ''; });
    try { await work(); }
    catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> load({bool older = false}) async {
    final page = await widget.api.conversationPage(threadId: threadId,
        before: older ? rows.last['id'] as String : null);
    if (mounted) setState(() {
      rows = older ? [...rows, ...page] : page;
      more = page.length == 30;
    });
  }

  Future<void> submit() async {
    final text = draft.text.trim();
    if (text.isEmpty) return;
    final id = threadId;
    if (id == null) {
      final result = await widget.api.requestConversation(text);
      if (!mounted) return;
      notice = 'Conversation with ${result['name']} is ${result['status']}.';
    } else {
      if (attemptedText != text) {
        attemptedText = text;
        clientId = const Uuid().v4();
      }
      await widget.api.sendMessage(id, text, clientId!);
      if (!mounted) return;
      attemptedText = null;
      notice = 'Message sent.';
    }
    draft.clear();
    await load();
  }

  Widget conversation(Json row) {
    final id = row['id'] as String;
    return ListTile(title: Text(row['name'] as String), subtitle: Text(row['status'] as String),
      onTap: row['status'] != 'accepted' ? null : () => Navigator.push(context,
        MaterialPageRoute<void>(builder: (_) => MessagesScreen(api: widget.api, thread: row))),
      trailing: row['incoming'] == true && row['status'] == 'pending' ? Wrap(children: [
        for (final status in ['accepted', 'declined'])
          TextButton(onPressed: busy ? null : () => run(() async {
            await widget.api.decideConversation(id, status);
            await load();
          }), child: Text(status == 'accepted' ? 'Accept' : 'Decline')),
      ]) : null);
  }

  @override
  Widget build(BuildContext context) {
    final inbox = threadId == null;
    return Scaffold(appBar: AppBar(title: Text(inbox ? 'Messages' : widget.thread!['name'] as String),
      actions: [IconButton(tooltip:'Refresh', icon:const Icon(Icons.refresh),
        onPressed:busy ? null : () => run(() => load()))]),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (busy) const LinearProgressIndicator(),
        if (error.isNotEmpty) Text(error),
        if (notice.isNotEmpty) Text(notice),
        if (!busy && error.isEmpty && rows.isEmpty) Text(inbox ? 'No conversations yet.' : 'No messages yet.'),
        if (inbox) ...rows.map(conversation)
        else for (final row in rows.reversed) ListTile(
          title: Text(row['body'] as String), subtitle: Text(row['mine'] == true ? 'You' : widget.thread!['name'] as String)),
        if (more) TextButton(onPressed: busy ? null : () => run(() => load(older:true)), child: const Text('Load older')),
        TextField(controller:draft, enabled:!busy, maxLength:inbox ? 254 : 2000, maxLines:inbox ? 1 : 3,
          keyboardType:inbox ? TextInputType.emailAddress : TextInputType.multiline,
          decoration: InputDecoration(labelText:inbox ? 'Recipient campus email' : 'Your message')),
        FilledButton(onPressed:busy ? null : () => run(submit),
          child:Text(inbox ? 'Request conversation' : 'Send message')),
      ]));
  }
}
