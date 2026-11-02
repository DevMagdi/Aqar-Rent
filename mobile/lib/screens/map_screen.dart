// Map tab: MapLibre raster style (tiles from env-style URL, no paid key) with
// Flutter-positioned price pins (raster styles have no glyph server).
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../models/models.dart';
import 'listing_detail_screen.dart';
import '../core/theme.dart';

const _tiles = String.fromEnvironment(
  'MAP_TILES_URL',
  defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
);

class MapScreen extends StatefulWidget {
  const MapScreen({super.key, required this.items});
  final List<SearchItem> items;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  MaplibreMapController? _controller;
  final List<Offset> _pinOffsets = [];
  bool _layoutDone = false;

  static const _style = {
    'version': 8,
    'sources': {
      'base': {'type': 'raster', 'tiles': [_tiles], 'tileSize': 256, 'attribution': '© OSM'},
    },
    'layers': [
      {'id': 'base', 'type': 'raster', 'source': 'base'},
    ],
  };

  Future<void> _projectPins() async {
    final c = _controller;
    if (c == null || !mounted) return;
    final offsets = <Offset>[];
    for (final item in widget.items) {
      try {
        final sc = await c.toScreenLocation(LatLng(item.geo.latitude, item.geo.longitude));
        offsets.add(Offset(sc.x.toDouble(), sc.y.toDouble()));
      } catch (_) {
        offsets.add(const Offset(-9999, -9999));
      }
    }
    if (mounted) setState(() => _pinOffsets = offsets);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        if (!_layoutDone) {
          _layoutDone = true;
          WidgetsBinding.instance.addPostFrameCallback((_) => _projectPins());
        }
        return Stack(
          children: [
            MaplibreMap(
              styleString: jsonEncode(_style),
              initialCameraPosition: const CameraPosition(target: LatLng(30.0444, 31.2357), zoom: 6),
              onMapCreated: (c) => _controller = c,
              onCameraIdle: _projectPins,
              onCameraChanged: (_) {},
            ),
            for (var i = 0; i < widget.items.length && i < _pinOffsets.length; i++)
              if (_pinOffsets[i].dx > -9999 && _pinOffsets[i].dx < box.maxWidth + 50)
                Positioned(
                  left: _pinOffsets[i].dx - 28,
                  top: _pinOffsets[i].dy - 14,
                  child: GestureDetector(
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => ListingDetailScreen(listingId: widget.items[i].id)),
                    ),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.gold,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: Colors.white),
                      ),
                      child: Text(
                        '${widget.items[i].rentMonthly}',
                        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ),
          ],
        );
      },
    );
  }
}
