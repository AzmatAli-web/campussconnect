import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
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

class _MessagesState extends State<MessagesScreen> with WidgetsBindingObserver {
  io.Socket? socket;
  Timer? timer;
  bool foreground = true, refreshing = false, dirty = false, connecting = false;
  Future<void> queue = Future.value();

  bool get visible => mounted && foreground && (ModalRoute.of(context)?.isCurrent ?? true);

  Future<void> connect() async {
    if (connecting || socket?.connected == true || !visible) return;
    connecting = true;
    try {
      final token = await widget.api.idTokenProvider();
      if (!visible) return;
      socket?.dispose();
      final next = io.io(widget.api.baseUri.origin, io.OptionBuilder()
          .setTransports(['websocket']).disableAutoConnect().enableForceNew()
          .setAuth({'token': token}).build());
      socket = next;
      next.onConnect((_) => refresh());
      next.on('inbox:update', (_) => refresh());
      next.connect();
    } catch (_) {
      // The authenticated history request can still recover missed updates.
    } finally {
      connecting = false;
    }
  }

  Future<void> refresh() async {
    if (!visible) return;
    if (refreshing) {
      dirty = true;
      return;
    }
    refreshing = true;
    try {
      await load();
      if (mounted && error.isNotEmpty) setState(() => error = '');
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      refreshing = false;
      if (dirty) {
        dirty = false;
        refresh();
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    foreground = state == AppLifecycleState.resumed;
    if (foreground) {
      connect();
      refresh();
    }
  }

  Json? current;
  final draft = TextEditingController();
  List<Json> rows = [];
  bool busy = false, more = false;
  String error = '', notice = '';
  String? attemptedText, clientId;
  String? get threadId => widget.thread?['id'] as String?;

  @override
  void initState() {
    super.initState();
    current = widget.thread;
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      connect();
      run(() => load());
    });
    timer = Timer.periodic(const Duration(minutes: 1), (_) {
      connect();
      refresh();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    timer?.cancel();
    socket?.dispose();
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

  Future<void> load({bool older = false}) {
    final result = queue.then((_) => fetchPages(older));
    queue = result.catchError((Object _) {});
    return result;
  }

  Future<void> fetchPages(bool older) async {
    if (!mounted) return;
    final id = threadId;
    if (id != null) {
      final state = await widget.api.conversationState(id);
      if (!mounted) return;
      setState(() => current = state);
    }
    final prior = rows;
    final merged = {for (final row in prior) row['id'] as String: row};
    String? cursor = older && prior.isNotEmpty ? prior.last['id'] as String : null;
    final boundary = prior.isEmpty ? null : (threadId == null ? prior.last : prior.first)['id'] as String;
    late List<Json> page;
    do {
      page = await widget.api.conversationPage(threadId: threadId, before: cursor);
      if (!mounted) return;
      for (final row in page) {
        merged[row['id'] as String] = row;
      }
      final unread = page.where((row) => row['unread'] == true).map((row) => row['id'] as String).toList();
      if (threadId != null && visible && unread.isNotEmpty) {
        await widget.api.readMessages(threadId!, unread);
      }
      cursor = page.isEmpty ? null : page.last['id'] as String;
    } while (mounted && !older && page.length == 30 && boundary != null && cursor!.compareTo(boundary) > 0);
    if (!mounted) return;
    setState(() {
      rows = merged.values.toList()..sort((a,b) => (b['id'] as String).compareTo(a['id'] as String));
      if (older || prior.isEmpty || threadId == null) more = page.length == 30;
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

  Future<void> report(Json thread, [String? messageId]) async {
    final reason = await showDialog<String>(context: context, builder: (context) =>
      SimpleDialog(title: Text(messageId == null ? 'Report conversation' : 'Report message'),
        children: [
          for (final reason in ['Harassment', 'Spam', 'Inappropriate content', 'Other safety concern'])
            SimpleDialogOption(onPressed: () => Navigator.pop(context, reason), child: Text(reason)),
          SimpleDialogOption(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        ]));
    if (reason == null || !mounted) return;
    await run(() async {
      await widget.api.reportConversation(thread['id'] as String, reason, messageId);
      if (mounted) setState(() => notice = 'Report received by campus moderation.');
    });
  }

  Widget controls(Json row) => Wrap(children: [
    TextButton(onPressed: busy ? null : () => run(() async {
      await widget.api.blockConversation(row['id'] as String, row['blockedByMe'] != true);
      await load();
    }), child: Text(row['blockedByMe'] == true ? 'Unblock' : 'Block')),
    TextButton(onPressed: busy ? null : () => report(row), child: const Text('Report conversation')),
  ]);

  Widget conversation(Json row) {
    final id = row['id'] as String;
    return ListTile(title: Text(row['name'] as String), subtitle: Text([row['status'], if (row['paused'] == true) 'Messaging paused', if ((row['unread'] as int? ?? 0) > 0) "${row['unread']} unread"].join(' · ')),
      onTap: row['status'] != 'accepted' ? null : () async {
        await Navigator.push(context,
        MaterialPageRoute<void>(builder: (_) => MessagesScreen(api: widget.api, thread: row)));
        await refresh();
      },
      trailing: row['paused'] != true && row['incoming'] == true && row['status'] == 'pending' ? Wrap(children: [
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
        if (inbox) ...rows.expand((row) => [conversation(row), controls(row)])
        else for (final row in rows.reversed) ListTile(
          trailing: row['mine'] == true ? null : IconButton(tooltip: 'Report message', icon: const Icon(Icons.flag),
            onPressed: busy ? null : () => report(widget.thread!, row['id'] as String)),
          title: Text(row['body'] as String), subtitle: Text(row['mine'] == true ? 'You' : widget.thread!['name'] as String)),
        if (more) TextButton(onPressed: busy ? null : () => run(() => load(older:true)), child: const Text('Load older')),
        if (current != null) controls(current!),
        if (current?['paused'] == true) const Text('Messaging is paused. You can still view history and report messages.')
        else ...[
        TextField(controller:draft, enabled:!busy, maxLength:inbox ? 254 : 2000, maxLines:inbox ? 1 : 3,
          keyboardType:inbox ? TextInputType.emailAddress : TextInputType.multiline,
          decoration: InputDecoration(labelText:inbox ? 'Recipient campus email' : 'Your message')),
        FilledButton(onPressed:busy ? null : () => run(submit),
          child:Text(inbox ? 'Request conversation' : 'Send message')),
        ],
      ]));
  }
}
