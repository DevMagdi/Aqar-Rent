// DTOs mirroring the backend OpenAPI schemas (single source of truth).
class User {
  User({required this.id, required this.phone, this.fullName, this.language = 'ar', this.status = 'active', this.verificationStatus = 'unverified'});
  final String id;
  final String phone;
  final String? fullName;
  final String language;
  final String status;
  final String verificationStatus;

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['id'] as String,
        phone: (j['phone'] ?? '') as String,
        fullName: j['full_name'] as String?,
        language: (j['language'] ?? 'ar') as String,
        status: (j['status'] ?? 'active') as String,
        verificationStatus: (j['verification_status'] ?? 'unverified') as String,
      );
}

class Geo {
  Geo({required this.latitude, required this.longitude, required this.accuracyM});
  final double latitude;
  final double longitude;
  final int accuracyM;
  factory Geo.fromJson(Map<String, dynamic> j) => Geo(
        latitude: (j['latitude'] as num).toDouble(),
        longitude: (j['longitude'] as num).toDouble(),
        accuracyM: (j['accuracy_m'] ?? 150) as int,
      );
}

class SearchItem {
  SearchItem({
    required this.id,
    required this.title,
    required this.propertyType,
    required this.rentMonthly,
    required this.areaM2,
    required this.bedrooms,
    required this.bathrooms,
    required this.furnished,
    required this.geo,
    this.thumbUrl,
    this.governorateId,
    this.cityId,
    this.addressText,
    this.trustLevel,
    this.verifiedOwner = false,
    this.officeNameAr,
    this.isFeatured = false,
  });
  final String id;
  final String title;
  final String propertyType;
  final int rentMonthly;
  final double areaM2;
  final int bedrooms;
  final int bathrooms;
  final String furnished;
  final Geo geo;
  final String? thumbUrl;
  final String? governorateId;
  final String? cityId;
  final String? addressText;
  final String? trustLevel;
  final bool verifiedOwner;
  final String? officeNameAr;
  final bool isFeatured;

  factory SearchItem.fromJson(Map<String, dynamic> j) => SearchItem(
        id: j['id'] as String,
        title: (j['title'] ?? '') as String,
        propertyType: (j['property_type'] ?? 'apartment') as String,
        rentMonthly: (j['rent_monthly'] as num?)?.toInt() ?? 0,
        areaM2: (j['area_m2'] as num?)?.toDouble() ?? 0,
        bedrooms: (j['bedrooms'] as num?)?.toInt() ?? 0,
        bathrooms: (j['bathrooms'] as num?)?.toInt() ?? 0,
        furnished: (j['furnished'] ?? 'unfurnished') as String,
        geo: Geo.fromJson(j['geo'] as Map<String, dynamic>),
        thumbUrl: j['thumb_url'] as String?,
        governorateId: j['governorate_id'] as String?,
        cityId: j['city_id'] as String?,
        addressText: j['address_text'] as String?,
        trustLevel: j['trust_level'] as String?,
        verifiedOwner: (j['verified_owner'] ?? false) as bool,
        officeNameAr: j['office_name_ar'] as String?,
        isFeatured: (j['is_featured'] ?? false) as bool,
      );
}

class Media {
  Media({required this.id, required this.url, this.thumbUrl, this.type = 'photo'});
  final String id;
  final String url;
  final String? thumbUrl;
  final String type;
  factory Media.fromJson(Map<String, dynamic> j) => Media(
        id: j['id'] as String,
        url: j['url'] as String,
        thumbUrl: j['thumb_url'] as String?,
        type: (j['type'] ?? 'photo') as String,
      );
}

class ListingDetail {
  ListingDetail.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String,
        propertyType = (j['property_type'] ?? '') as String,
        rentalType = (j['rental_type'] ?? '') as String,
        furnished = (j['furnished'] ?? '') as String,
        rentMonthly = (j['rent_monthly'] as num?)?.toInt() ?? 0,
        depositMonths = (j['deposit_months'] as num?)?.toInt() ?? 0,
        areaM2 = (j['area_m2'] as num?)?.toDouble() ?? 0,
        bedrooms = (j['bedrooms'] as num?)?.toInt() ?? 0,
        bathrooms = (j['bathrooms'] as num?)?.toInt() ?? 0,
        floor = j['floor'] as int?,
        hasElevator = (j['has_elevator'] ?? false) as bool,
        finishing = j['finishing'] as String?,
        amenities = (j['amenities'] as Map<String, dynamic>?) ?? const {},
        description = (j['description'] ?? '') as String,
        addressText = (j['address_text'] ?? '') as String,
        geo = Geo.fromJson(j['geo'] as Map<String, dynamic>),
        availableFrom = j['available_from'] as String?,
        minTermMonths = (j['min_term_months'] as num?)?.toInt() ?? 1,
        verifiedBadge = (j['verified_badge'] ?? false) as bool,
        trustLevel = (j['trust']?['level'] ?? j['verification_level'] ?? 'phone') as String,
        trustLabelAr = j['trust']?['label_ar'] as String?,
        trustNoteAr = j['trust']?['note_ar'] as String?,
        officeNameAr = j['office']?['name_ar'] as String?,
        isFeatured = (j['is_featured'] ?? false) as bool,
        isOwner = (j['is_owner'] ?? false) as bool,
        status = j['status'] as String?,
        viewCount = (j['view_count'] as num?)?.toInt() ?? 0,
        ownerName = j['owner_name'] as String?,
        media = ((j['media'] as List?) ?? []).whereType<Map<String, dynamic>>().map(Media.fromJson).toList();

  final String id, title, propertyType, rentalType, furnished;
  final int rentMonthly, depositMonths, bedrooms, bathrooms, minTermMonths, viewCount;
  final double areaM2;
  final int? floor;
  final bool hasElevator, verifiedBadge, isOwner, isFeatured;
  final String trustLevel;
  final String? trustLabelAr, trustNoteAr, officeNameAr;
  final String? finishing, availableFrom, status, ownerName;
  final String description, addressText;
  final Map<String, dynamic> amenities;
  final Geo geo;
  final List<Media> media;
}

class MeListing {
  MeListing.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = (j['title'] ?? '') as String,
        status = (j['status'] ?? 'draft') as String,
        rejectReason = j['reject_reason'] as String?,
        rentMonthly = (j['rent_monthly'] as num?)?.toInt() ?? 0,
        thumbUrl = j['thumb_url'] as String?,
        stats = (j['stats'] as Map<String, dynamic>?) ?? const {};
  final String id, title, status;
  final String? rejectReason, thumbUrl;
  final int rentMonthly;
  final Map<String, dynamic> stats;
}

class Order {
  Order.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        listingId = j['listing_id'] as String,
        weeks = (j['weeks'] as num?)?.toInt() ?? 0,
        total = (j['total'] as num?)?.toDouble() ?? 0,
        status = (j['status'] ?? 'pending') as String,
        method = (j['method'] ?? '') as String,
        checkoutUrl = j['checkout_url'] as String?,
        paymentReference = j['payment_reference'] as String?,
        gatewayRef = j['gateway_ref'] as String?,
        expiresAt = j['expires_at'] as String?;
  final String id, listingId, status, method;
  final int weeks;
  final double total;
  final String? checkoutUrl, paymentReference, gatewayRef, expiresAt;
}

class AppNotification {
  AppNotification.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        type = (j['type'] ?? '') as String,
        title = (j['title'] ?? '') as String,
        body = (j['body'] ?? '') as String,
        read = j['read_at'] != null,
        createdAt = j['created_at'] as String?;
  final String id, type, title, body;
  final bool read;
  final String? createdAt;
}

class Verification {
  Verification.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        docType = (j['doc_type'] ?? '') as String,
        status = (j['status'] ?? 'pending') as String,
        rejectReason = j['reject_reason'] as String?,
        rejectReasonCode = j['reject_reason_code'] as String?,
        appealStatus = (j['appeal_status'] ?? 'none') as String,
        appealNote = j['appeal_note'] as String?,
        fileUrl = j['file_url'] as String?;
  final String id, docType, status, appealStatus;
  final String? rejectReason, rejectReasonCode, appealNote, fileUrl;
}
