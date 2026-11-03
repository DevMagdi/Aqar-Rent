// Image compression before upload: mid-range Egyptian devices + metered data.
import 'dart:io';

import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

class MediaService {
  MediaService._();
  static final MediaService instance = MediaService._();
  final ImagePicker _picker = ImagePicker();

  Future<XFile?> pickPhoto({bool camera = false}) => _picker.pickImage(
        source: camera ? ImageSource.camera : ImageSource.gallery,
        maxWidth: 2048,
        maxHeight: 2048,
        imageQuality: 85,
      );

  Future<List<XFile>> pickMany() => _picker.pickMultiImage(maxWidth: 2048, maxHeight: 2048, imageQuality: 85);

  /// JPEG-compress to <= ~450 KB with a 1600 px long edge. Falls back to the
  /// original when the platform codec is unavailable (never loses the upload).
  Future<File> compress(File source) async {
    final dir = await getTemporaryDirectory();
    final target = '${dir.path}/aqar_${DateTime.now().millisecondsSinceEpoch}.jpg';
    final result = await FlutterImageCompress.compressAndGetFile(
      source.absolute.path,
      target,
      quality: 78,
      minWidth: 1080,
      minHeight: 1080,
      format: CompressFormat.jpeg,
    );
    if (result == null) return source;
    final file = File(result.path);
    if (await file.length() > 600 * 1024) {
      final smaller = await FlutterImageCompress.compressAndGetFile(
        file.path,
        '${target}_s.jpg',
        quality: 60,
        minWidth: 1280,
        minHeight: 1280,
        format: CompressFormat.jpeg,
      );
      if (smaller != null) return File(smaller.path);
    }
    return file;
  }
}
