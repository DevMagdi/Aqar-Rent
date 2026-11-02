// Checkout: weeks1-4 × plan price, promo validation (live totals), method
// pick → POST /orders → gateway/bank panel (real backend, no mock UI paths).
import 'package:flutter/material.dart';

import 'package:url_launcher/url_launcher.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import 'orders_screen.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key, required this.listingId, required this.title, this.editMode = false});
  final String listingId;
  final String title;
  final bool editMode;

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final api = ApiClient();
  int _weeks = 1;
  String _method = 'card';
  String _promo = '';
  double _subtotal = 0;
  double _discount = 0;
  String? _promoMsg;
  bool _busy = false;
  Plan? _plan;

  static const _methods = [
    ('card', 'بطاقة بنكية'),
    ('fawry', 'فوري'),
    ('vodafone_cash', 'فودافون كاش'),
    ('bank_transfer', 'تحويل بنكي'),
  ];

  @override
  void initState() {
    super.initState();
    _loadPlan();
  }

  Future<void> _loadPlan() async {
    try {
      final rows = await api.get('/plans') as List;
      if (rows.isNotEmpty && mounted) {
        setState(() {
          _plan = Plan.fromJson(rows.first as Map<String, dynamic>);
          _recalc();
        });
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  void _recalc() {
    final p = _plan;
    if (p == null) return;
    setState(() {
      _subtotal = p.priceEgp * _weeks;
      _discount = 0;
      _promoMsg = null;
    });
  }

  Future<void> _applyPromo() async {
    if (_promo.trim().isEmpty || _plan == null) return;
    try {
      final res = await api.post('/promo/validate', data: {'code': _promo.trim(), 'weeks': _weeks}) as Map<String, dynamic>;
      setState(() {
        if (res['valid'] == true) {
          _discount = (res['discount'] as num).toDouble();
          _subtotal = (res['subtotal'] as num).toDouble();
          _promoMsg = 'تم تطبيق الخصم ✓';
        } else {
          _discount = 0;
          _promoMsg = (res['message'] ?? 'كود غير صالح') as String;
        }
      });
    } catch (e) {
      setState(() => _promoMsg = '$e');
    }
  }

  Future<void> _createOrder() async {
    setState(() => _busy = true);
    try {
      final order = await api.post('/orders', data: {
        'listing_id': widget.listingId,
        'weeks': _weeks,
        'method': _method,
        if (_promo.trim().isNotEmpty) 'promo_code': _promo.trim(),
      }) as Map<String, dynamic>;
      if (!mounted) return;
      await Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => OrderPayScreen(order: Order.fromJson(order))),
      );
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = _subtotal - _discount;
    return Scaffold(
      appBar: AppBar(title: Text('دفع رسوم الإعلان')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(widget.title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          Text('عدد الأسابيع', style: Theme.of(context).textTheme.labelLarge),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 1, label: Text('1')),
              ButtonSegment(value: 2, label: Text('2')),
              ButtonSegment(value: 3, label: Text('3')),
              ButtonSegment(value: 4, label: Text('4')),
            ],
            selected: {_weeks},
            onSelectionChanged: (s) => setState(() { _weeks = s.first; _recalc(); }),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextField(
                  decoration: const InputDecoration(labelText: 'كود الخصم', isDense: true, border: OutlineInputBorder()),
                  onChanged: (v) => _promo = v,
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(onPressed: _applyPromo, child: const Text('تطبيق')),
            ],
          ),
          if (_promoMsg != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(_promoMsg!, style: TextStyle(color: _promoMsg!.contains('✓') ? Colors.green : Colors.red, fontSize: 12)),
            ),
          const SizedBox(height: 16),
          Text('طريقة الدفع', style: Theme.of(context).textTheme.labelLarge),
          Wrap(
            spacing: 8,
            children: [
              for (final (id, label) in _methods)
                ChoiceChip(
                  label: Text(label),
                  selected: _method == id,
                  onSelected: (_) => setState(() => _method = id),
                ),
            ],
          ),
          const SizedBox(height: 20),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('الإجمالي قبل الخصم'), Text('${_subtotal.toStringAsFixed(0)} جنيه')]),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('الخصم'), Text('${_discount.toStringAsFixed(0)} جنيه')]),
                  const Divider(),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [Text('الإجمالي', style: Theme.of(context).textTheme.titleMedium), Text('${total.toStringAsFixed(0)} جنيه', style: const TextStyle(fontWeight: FontWeight.bold))],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _createOrder,
            child: Text(_busy ? '…' : 'متابعة الدفع'),
          ),
        ],
      ),
    );
  }
}

class Plan {
  Plan.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = (j['name'] ?? '') as String,
        priceEgp = (j['price_egp'] as num).toDouble(),
        durationDays = (j['duration_days'] as num).toInt();
  final String id, name;
  final double priceEgp;
  final int durationDays;
}

/// Order payment screen: gateway link (card/wallet/Fawry) or bank instructions
/// + receipt upload; polls status until paid.
class OrderPayScreen extends StatefulWidget {
  const OrderPayScreen({super.key, required this.order});
  final Order order;

  @override
  State<OrderPayScreen> createState() => _OrderPayScreenState();
}

class _OrderPayScreenState extends State<OrderPayScreen> {
  final api = ApiClient();
  late Order _order;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _order = widget.order;
    _refreshCheckout();
  }

  Future<void> _refreshCheckout() async {
    if (_order.status != 'pending' || _order.method == 'bank_transfer') return;
    try {
      final res = await api.post('/orders/${_order.id}/checkout', data: {}) as Map<String, dynamic>;
      final merged = <String, dynamic>{
        'id': _order.id,
        'listing_id': _order.listingId,
        'weeks': _order.weeks,
        'total': _order.total,
        'status': _order.status,
        'method': _order.method,
        'checkout_url': res['checkout_url'] ?? _order.checkoutUrl,
        'payment_reference': res['payment_reference'] ?? _order.paymentReference,
        'gateway_ref': _order.gatewayRef,
        'expires_at': res['expires_at'] ?? _order.expiresAt,
      };
      if (mounted) setState(() => _order = Order.fromJson(merged));
      final url = res['checkout_url'] as String?;
      if (url != null && url.startsWith('http') && mounted) {
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _poll() async {
    setState(() => _busy = true);
    for (var i = 0; i < 12; i++) {
      await Future<void>.delayed(const Duration(seconds: 2));
      try {
        final res = await api.get('/orders/${_order.id}') as Map<String, dynamic>;
        if (!mounted) return;
        setState(() => _order = Order.fromJson(res));
        if (_order.status != 'pending') break;
      } catch (_) {}
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final o = _order;
    return Scaffold(
      appBar: AppBar(title: const Text('الدفع')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('الطلب: ${o.id.substring(0, 8)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  Text('${o.weeks} أسابيع · ${o.total.toStringAsFixed(0)} جنيه'),
                  const SizedBox(height: 6),
                  Text('الحالة: ${o.status}'),
                  if (o.paymentReference != null)
                    SelectableText('المرجع: ${o.paymentReference}', style: const TextStyle(fontFamily: 'monospace')),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (o.status == 'paid')
            Card(
              color: const Color(0xFFECFDF5),
              child: ListTile(
                leading: const Icon(Icons.check_circle, color: Colors.green),
                title: const Text('تم الدفع ✓'),
                subtitle: const Text('إعلانك قيد النشر'),
                trailing: TextButton(onPressed: () => Navigator.pop(context), child: const Text('تم')),
              ),
            )
          else if (o.status == 'pending' && o.method != 'bank_transfer')
            FilledButton.icon(
              onPressed: o.checkoutUrl == null ? _refreshCheckout : () => launchUrl(Uri.parse(o.checkoutUrl!), mode: LaunchMode.externalApplication),
              icon: const Icon(Icons.open_in_new),
              label: Text(o.checkoutUrl == null ? 'تجهيز الدفع' : 'فتح صفحة الدفع'),
            )
          else if (o.status == 'pending')
            const Card(
              child: ListTile(
                leading: Icon(Icons.account_balance),
                title: Text('حوّل المبلغ لحسابنا وأرفق الإيصال من صفحة الطلبات'),
                subtitle: Text('راجع صفحة الطلبات لحالة الاعتماد'),
              ),
            ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _busy ? null : _poll,
            icon: const Icon(Icons.refresh),
            label: Text(_busy ? '…' : 'تحديث الحالة'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrdersScreen())),
            child: const Text('طلباتي وإيصالاتي'),
          ),
        ],
      ),
    );
  }
}
