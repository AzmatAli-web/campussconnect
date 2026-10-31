import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../models/campus_models.dart';
import '../services/campus_api.dart';
import 'student_dashboard.dart';

String readableAuthError(Object error) {
  if (error is FirebaseAuthException) {
    switch (error.code) {
      case 'email-already-in-use':
        return 'An account already exists with this university email.';
      case 'invalid-email':
        return 'Enter a valid university email address.';
      case 'weak-password':
        return 'Choose a stronger password.';
      case 'wrong-password':
      case 'invalid-credential':
      case 'user-not-found':
        return 'Email or password is incorrect.';
      case 'too-many-requests':
        return 'Too many attempts. Try again later.';
      default:
        return error.message ?? 'Firebase authentication failed.';
    }
  }
  return error.toString();
}

class CampusAuthScreen extends StatefulWidget {
  const CampusAuthScreen({super.key});

  @override
  State<CampusAuthScreen> createState() => _CampusAuthScreenState();
}

class _CampusAuthScreenState extends State<CampusAuthScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _register = false;
  bool _busy = false;
  String? _message;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate() || _busy) return;
    setState(() { _busy = true; _error = null; _message = null; });
    try {
      final email = _email.text.trim().toLowerCase();
      if (_register) {
        final created = await FirebaseAuth.instance.createUserWithEmailAndPassword(
          email: email,
          password: _password.text,
        );
        await created.user!.sendEmailVerification();
        await FirebaseAuth.instance.signOut();
        if (mounted) {
          setState(() {
            _register = false;
            _message = 'Verification link sent to your university inbox. '
                'Open it, then sign in here.';
            _password.clear();
          });
        }
      } else {
        await FirebaseAuth.instance.signInWithEmailAndPassword(
          email: email,
          password: _password.text,
        );
      }
    } catch (error) {
      if (mounted) setState(() => _error = readableAuthError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 450),
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 27, vertical: 35),
              shrinkWrap: true,
              children: [
                const _BrandHeading(),
                const SizedBox(height: 42),
                Text(_register ? 'Join your campus.' : 'Welcome back.',
                    style: const TextStyle(fontSize: 31, fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                Text(
                  _register
                      ? 'Create an account using an official university email.'
                      : 'Sign in to explore events, announcements and your registrations.',
                  style: const TextStyle(color: Color(0xFF72879A), height: 1.55),
                ),
                const SizedBox(height: 29),
                if (_message != null) _Notice(_message!, success: true),
                if (_error != null) _Notice(_error!, success: false),
                Form(
                  key: _form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'University email',
                          prefixIcon: Icon(Icons.alternate_email),
                        ),
                        validator: (value) => AppConfig.isCampusEmail(value ?? '')
                            ? null
                            : 'Use your verified @${AppConfig.universityDomain} email.',
                      ),
                      const SizedBox(height: 17),
                      TextFormField(
                        controller: _password,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Password',
                          prefixIcon: Icon(Icons.lock_outline),
                        ),
                        validator: (value) => (value?.length ?? 0) < 6
                            ? 'Password must have at least 6 characters.'
                            : null,
                      ),
                      const SizedBox(height: 23),
                      FilledButton(
                        onPressed: _busy ? null : _submit,
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                        child: Text(_busy
                            ? 'Please wait...'
                            : _register ? 'Create account' : 'Sign in'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                TextButton(
                  onPressed: _busy ? null : () {
                    setState(() {
                      _register = !_register;
                      _message = null;
                      _error = null;
                    });
                  },
                  child: Text(_register
                      ? 'Already registered? Sign in'
                      : 'New here? Create a student account'),
                ),
                const SizedBox(height: 42),
                const _PrivacyFooter(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class CampusAccountGate extends StatefulWidget {
  final User user;
  const CampusAccountGate({super.key, required this.user});

  @override
  State<CampusAccountGate> createState() => _CampusAccountGateState();
}

class _CampusAccountGateState extends State<CampusAccountGate> {
  late final CampusApi _api;
  late Future<CampusProfile?> _profile;
  bool _busy = false;
  String? _error;
  String? _message;

  @override
  void initState() {
    super.initState();
    _api = CampusApi(idTokenProvider: () async {
      final signedIn = FirebaseAuth.instance.currentUser;
      return await signedIn?.getIdToken() ?? '';
    });
    _profile = _fetchProfile();
  }

  Future<CampusProfile?> _fetchProfile() async {
    if (!widget.user.emailVerified) return null;
    try {
      return await _api.getProfile();
    } on CampusApiException catch (error) {
      if (error.code == 'PROFILE_NOT_FOUND') return null;
      rethrow;
    }
  }

  Future<void> _retry() async {
    if (_busy) return;
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await widget.user.reload();
      await widget.user.getIdToken(true);
      if (mounted) setState(() => _profile = _fetchProfile());
    } catch (error) {
      if (mounted) setState(() => _error = readableAuthError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      await widget.user.sendEmailVerification();
      if (mounted) {
        setState(() => _message = 'A new verification link was sent to your university email.');
      }
    } catch (error) {
      if (mounted) setState(() => _error = readableAuthError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.user.emailVerified) {
      return _GateScaffold(
        title: 'Verify your campus email',
        description: 'Open the verification email sent to ${widget.user.email}, '
            'then return and check verification.',
        children: [
          if (_error != null) _Notice(_error!),
          if (_message != null) _Notice(_message!, success: true),
          FilledButton(onPressed: _busy ? null : _retry, child: const Text("I've verified my email")),
          OutlinedButton(onPressed: _busy ? null : _resend, child: const Text('Resend verification email')),
          TextButton(onPressed: () => FirebaseAuth.instance.signOut(), child: const Text('Switch account')),
        ],
      );
    }
    return FutureBuilder<CampusProfile?>(
      future: _profile,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (snapshot.hasError) {
          return _GateScaffold(
            title: 'Campus connection unavailable',
            description: 'Your Firebase session is valid, but the backend profile could not load.',
            children: [
              _Notice(snapshot.error.toString()),
              FilledButton(onPressed: _retry, child: const Text('Retry connection')),
              OutlinedButton(onPressed: () => FirebaseAuth.instance.signOut(), child: const Text('Sign out')),
            ],
          );
        }
        final profile = snapshot.data;
        if (profile == null) return _ProfileCreation(api: _api, onCreated: _retry);
        if (profile.status != 'active') {
          return _GateScaffold(
            title: 'Campus access pending',
            description: 'Your account is ${profile.status}. '
                'Approval is required before campus content is available.',
            children: [
              FilledButton(onPressed: _retry, child: const Text('Check status again')),
              OutlinedButton(onPressed: () => FirebaseAuth.instance.signOut(), child: const Text('Sign out')),
            ],
          );
        }
        return StudentDashboard(api: _api, profile: profile);
      },
    );
  }
}

class _ProfileCreation extends StatefulWidget {
  final CampusApi api;
  final VoidCallback onCreated;
  const _ProfileCreation({required this.api, required this.onCreated});

  @override
  State<_ProfileCreation> createState() => _ProfileCreationState();
}

class _ProfileCreationState extends State<_ProfileCreation> {
  final form = GlobalKey<FormState>();
  final name = TextEditingController();
  final registration = TextEditingController();
  bool busy = false;
  String? error;

  @override
  void dispose() {
    name.dispose();
    registration.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (busy || !form.currentState!.validate()) return;
    setState(() { busy = true; error = null; });
    try {
      await widget.api.createProfile(
        fullName: name.text,
        registrationNo: registration.text,
      );
      if (mounted) widget.onCreated();
    } catch (failure) {
      if (mounted) setState(() => error = failure.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _GateScaffold(
      title: 'Complete your campus profile',
      description: 'Your university email is verified. Tell us who you are.',
      children: [
        if (error != null) _Notice(error!),
        Form(
          key: form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: name,
                decoration: const InputDecoration(labelText: 'Full name'),
                validator: (text) => (text?.trim().length ?? 0) < 2
                    ? 'Enter at least 2 characters.'
                    : null,
              ),
              const SizedBox(height: 15),
              TextFormField(
                controller: registration,
                decoration: const InputDecoration(
                  labelText: 'Registration number (optional)',
                  hintText: 'FA23-BSE-024',
                ),
              ),
              const SizedBox(height: 19),
              FilledButton(
                onPressed: busy ? null : submit,
                child: const Text('Create student profile'),
              ),
            ],
          ),
        ),
        TextButton(onPressed: () => FirebaseAuth.instance.signOut(), child: const Text('Sign out')),
      ],
    );
  }
}

class _BrandHeading extends StatelessWidget {
  const _BrandHeading();

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Container(
            height: 52,
            width: 52,
            decoration: BoxDecoration(
              color: const Color(0xFF12BDA7),
              borderRadius: BorderRadius.circular(17),
            ),
            child: const Center(
              child: Text('C·', style: TextStyle(fontSize: 27, fontWeight: FontWeight.w900)),
            ),
          ),
          const SizedBox(width: 12),
          const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('CampusConnect', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 19)),
              Text('COMSATS Abbottabad · Student', style: TextStyle(color: Color(0xFF78909C), fontSize: 12)),
            ],
          ),
        ],
      );
}

class _GateScaffold extends StatelessWidget {
  final String title;
  final String description;
  final List<Widget> children;
  const _GateScaffold({
    required this.title,
    required this.description,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: ListView(
              padding: const EdgeInsets.all(28),
              shrinkWrap: true,
              children: [
                const _BrandHeading(),
                const SizedBox(height: 42),
                Text(title, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
                const SizedBox(height: 12),
                Text(description, style: const TextStyle(color: Color(0xFF6D8796), height: 1.6)),
                const SizedBox(height: 25),
                ...children.map((child) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: child,
                    )),
                const SizedBox(height: 25),
                const _PrivacyFooter(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  final String message;
  final bool success;
  const _Notice(this.message, {this.success = false});

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 15),
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: success ? const Color(0xFFE7F9F0) : const Color(0xFFFFEFF0),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          message,
          style: TextStyle(color: success ? const Color(0xFF1A7459) : const Color(0xFFA63A46)),
        ),
      );
}

class _PrivacyFooter extends StatelessWidget {
  const _PrivacyFooter();

  @override
  Widget build(BuildContext context) => const Text(
        'Private student records never appear on public event listings. '
        'CampusConnect uses your verified university email.',
        textAlign: TextAlign.center,
        style: TextStyle(color: Color(0xFF8294A4), fontSize: 12, height: 1.65),
      );
}
