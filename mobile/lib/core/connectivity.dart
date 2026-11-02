// Connectivity stream used for offline banners and cache fallback.
import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

class ConnectivityService {
  ConnectivityService._();
  static final ConnectivityService instance = ConnectivityService._();

  final Connectivity _connectivity = Connectivity();
  final _controller = StreamController<bool>.broadcast();
  bool _online = true;

  bool get online => _online;
  Stream<bool> get changes => _controller.stream;

  Future<void> init() async {
    final result = await _connectivity.checkConnectivity();
    _update(result);
    _connectivity.onConnectivityChanged.listen(_update);
  }

  void _update(List<ConnectivityResult> results) {
    _online = results.any((r) => r != ConnectivityResult.none);
    if (!_controller.isClosed) _controller.add(_online);
  }

  Future<bool> refresh() async {
    _update(await _connectivity.checkConnectivity());
    return _online;
  }
}
