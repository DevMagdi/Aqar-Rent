// Plain models for contracts & handovers (mirrors backend schemas).
class ContractParty {
  ContractParty({required this.id, required this.role, required this.fullName, required this.phone, required this.nidMasked});
  final String id;
  final String role;
  final String fullName;
  final String phone;
  final String nidMasked;

  factory ContractParty.fromJson(Map<String, dynamic> j) => ContractParty(
        id: j['id'] as String,
        role: j['role'] as String,
        fullName: (j['full_name'] ?? '') as String,
        phone: (j['phone'] ?? '') as String,
        nidMasked: (j['national_id_masked'] ?? '***') as String,
      );
}

class Contract {
  Contract({
    required this.id,
    required this.referenceNo,
    required this.listingId,
    this.listingTitle,
    required this.template,
    required this.status,
    required this.terms,
    required this.parties,
    this.termsHash,
    required this.confirmationsLog,
    required this.feeRequired,
    required this.feeAmount,
    this.feeOrderStatus,
    required this.pdfReady,
    required this.canEdit,
    required this.canConfirm,
  });

  final String id;
  final String referenceNo;
  final String listingId;
  final String? listingTitle;
  final String template;
  final String status;
  final Map<String, dynamic> terms;
  final List<ContractParty> parties;
  final String? termsHash;
  final List<dynamic> confirmationsLog;
  final bool feeRequired;
  final double feeAmount;
  final String? feeOrderStatus;
  final bool pdfReady;
  final bool canEdit;
  final bool canConfirm;

  factory Contract.fromJson(Map<String, dynamic> j) => Contract(
        id: j['id'] as String,
        referenceNo: j['reference_no'] as String,
        listingId: j['listing_id'] as String,
        listingTitle: j['listing_title'] as String?,
        template: j['template'] as String,
        status: j['status'] as String,
        terms: (j['terms'] as Map<String, dynamic>?) ?? {},
        parties: ((j['parties'] as List?) ?? []).map((e) => ContractParty.fromJson(e as Map<String, dynamic>)).toList(),
        termsHash: j['terms_hash'] as String?,
        confirmationsLog: (j['confirmations_log'] as List?) ?? [],
        feeRequired: (j['fee_required'] ?? false) as bool,
        feeAmount: ((j['fee_amount'] ?? 0) as num).toDouble(),
        feeOrderStatus: j['fee_order_status'] as String?,
        pdfReady: (j['pdf_ready'] ?? false) as bool,
        canEdit: (j['can_edit'] ?? false) as bool,
        canConfirm: (j['can_confirm'] ?? false) as bool,
      );
}

class HandoverItem {
  HandoverItem({required this.label, this.condition, this.note = ''});
  final String label;
  final String? condition;
  final String note;

  Map<String, dynamic> toJson() => {'label': label, 'condition': condition, 'note': note};

  factory HandoverItem.fromJson(Map<String, dynamic> j) => HandoverItem(
        label: (j['label'] ?? '') as String,
        condition: j['condition'] as String?,
        note: (j['note'] ?? '') as String,
      );
}

class HandoverRoom {
  HandoverRoom({required this.name, required this.items});
  final String name;
  final List<HandoverItem> items;

  Map<String, dynamic> toJson() => {'name': name, 'items': items.map((i) => i.toJson()).toList()};
}

class Handover {
  Handover({
    required this.id,
    required this.contractId,
    required this.kind,
    required this.status,
    required this.data,
    this.sourceHandoverId,
    this.hash,
    required this.canEdit,
    required this.canConfirm,
  });

  final String id;
  final String contractId;
  final String kind;
  final String status;
  final Map<String, dynamic> data;
  final String? sourceHandoverId;
  final String? hash;
  final bool canEdit;
  final bool canConfirm;

  factory Handover.fromJson(Map<String, dynamic> j) => Handover(
        id: j['id'] as String,
        contractId: j['contract_id'] as String,
        kind: j['kind'] as String,
        status: j['status'] as String,
        data: (j['data'] as Map<String, dynamic>?) ?? {},
        sourceHandoverId: j['source_handover_id'] as String?,
        hash: j['hash'] as String?,
        canEdit: (j['can_edit'] ?? false) as bool,
        canConfirm: (j['can_confirm'] ?? false) as bool,
      );
}

const roomNames = [
  'living_room',
  'bedroom_1',
  'bedroom_2',
  'bedroom_3',
  'kitchen',
  'bathroom_1',
  'bathroom_2',
  'balcony',
  'other',
];

const roomLabelsAr = {
  'living_room': 'الصالة',
  'bedroom_1': 'غرفة النوم1',
  'bedroom_2': 'غرفة النوم2',
  'bedroom_3': 'غرفة النوم3',
  'kitchen': 'المطبخ',
  'bathroom_1': 'الحمام1',
  'bathroom_2': 'الحمام2',
  'balcony': 'البلكونة',
  'other': 'أخرى',
};

const conditionLabelsAr = {'good': 'جيدة', 'needs_repair': 'تحتاج صيانة', 'damaged': 'متضررة'};
const meterLabelsAr = {'electricity': 'الكهرباء', 'water': 'المياه', 'gas': 'الغاز'};
