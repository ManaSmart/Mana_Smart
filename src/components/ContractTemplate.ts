// Contract template variables and their default values
export interface ContractVariables {
  contract_date: string;
  contract_number: string;
  client_name: string;
  client_cr: string;
  client_city: string;
  monthly_fee: string;
  semi_annual_fee: string;
  annual_fee: string;
  service_address: string;
  service_address_en: string;
  device_count: string;
  device_types: string;
  emergency_visit_fee: string;
  client_representative: string;
  client_position: string;
}

export const generateContractHTML = (variables: ContractVariables) => {
  const replaceVariables = (template: string): string => {
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value || `{{${key}}}`);
    });
    return result;
  };

  const template = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>عقد خدمة التعطير - Aromatic Service Agreement</title>
      <style>
        @page { 
          size: A4; 
          margin: 15mm; 
        }
        
        * { 
          margin: 0; 
          padding: 0; 
          box-sizing: border-box; 
        }
        
        body { 
          font-family: 'Segoe UI', 'Arial', sans-serif;
          line-height: 1.8;
          color: #1a1a1a;
          font-size: 11pt;
          background: linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%);
        }
        
        .contract-container { 
          max-width: 210mm; 
          margin: 0 auto; 
          padding: 20px;
          background: white;
        }
        
        .header {
          text-align: center;
          padding: 25px 0;
          border-bottom: 4px solid #1e40af;
          margin-bottom: 25px;
          background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
          border-radius: 8px 8px 0 0;
        }
        
        .company-name {
          font-size: 26pt;
          font-weight: bold;
          color: #1e40af;
          margin-bottom: 8px;
        }
        
        .company-name-ar {
          font-size: 22pt;
          font-weight: bold;
          color: #3b82f6;
          margin-bottom: 12px;
        }
        
        .company-info {
          font-size: 10pt;
          color: #64748b;
          line-height: 1.6;
        }
        
        .contract-title {
          text-align: center;
          margin: 30px 0;
          padding: 20px;
          background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
          border-radius: 8px;
        }
        
        .contract-title h1 {
          font-size: 22pt;
          color: #1e40af;
          margin-bottom: 8px;
        }
        
        .contract-title-ar {
          font-size: 20pt;
          color: #3b82f6;
          margin-top: 5px;
        }
        
        .contract-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin: 25px 0;
          padding: 20px;
          background: #f8fafc;
          border-radius: 8px;
          border: 2px solid #e2e8f0;
        }
        
        .detail-item {
          margin: 8px 0;
        }
        
        .detail-label {
          font-weight: 600;
          color: #475569;
          display: inline-block;
          min-width: 120px;
        }
        
        .detail-value {
          color: #1e293b;
          font-weight: 500;
        }
        
        .parties {
          margin: 30px 0;
        }
        
        .party-section {
          margin: 25px 0;
          padding: 20px;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          border-radius: 8px;
          border-left: 5px solid #3b82f6;
        }
        
        .party-title {
          font-size: 16pt;
          font-weight: bold;
          color: #1e40af;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #e2e8f0;
        }
        
        .party-info {
          line-height: 2;
          color: #334155;
        }
        
        .clause {
          margin: 25px 0;
          page-break-inside: avoid;
        }
        
        .clause-header {
          font-size: 13pt;
          font-weight: bold;
          color: #1e40af;
          margin-bottom: 12px;
          padding: 12px;
          background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
          border-radius: 6px;
          border-left: 4px solid #3b82f6;
        }
        
        .clause-content {
          margin: 12px 0;
          padding: 15px;
          background: #f8fafc;
          border-radius: 6px;
          color: #334155;
          line-height: 1.9;
        }
        
        .clause-content-en {
          color: #64748b;
          font-style: italic;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px dashed #cbd5e1;
        }
        
        .payment-options {
          margin: 15px 0;
          padding: 15px;
          background: #fffbeb;
          border-radius: 6px;
          border: 2px solid #fcd34d;
        }
        
        .payment-option {
          margin: 10px 0;
          padding: 10px;
          background: white;
          border-radius: 4px;
        }
        
        .signatures {
          margin-top: 50px;
          page-break-inside: avoid;
        }
        
        .signature-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-top: 30px;
        }
        
        .signature-box {
          padding: 25px;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          border: 2px solid #cbd5e1;
          border-radius: 8px;
          min-height: 200px;
        }
        
        .signature-title {
          font-size: 14pt;
          font-weight: bold;
          color: #1e40af;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 2px solid #e2e8f0;
        }
        
        .signature-field {
          margin: 15px 0;
          padding-bottom: 10px;
        }
        
        .signature-label {
          font-weight: 600;
          color: #475569;
          display: block;
          margin-bottom: 8px;
        }
        
        .signature-line {
          border-bottom: 2px solid #cbd5e1;
          padding: 15px 0;
          min-height: 50px;
        }
        
        .bilingual {
          margin: 8px 0;
        }
        
        .ar {
          text-align: right;
          direction: rtl;
          color: #1e293b;
        }
        
        .en {
          text-align: left;
          direction: ltr;
          color: #64748b;
          font-size: 10pt;
          margin-top: 5px;
        }
        
        .highlight {
          background: #fef3c7;
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: 600;
          color: #92400e;
        }
        
        .footer {
          margin-top: 50px;
          padding: 25px;
          background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
          border-radius: 8px;
          border-top: 3px solid #3b82f6;
          text-align: center;
        }
        
        .footer-title {
          font-size: 14pt;
          font-weight: bold;
          color: #1e40af;
          margin-bottom: 15px;
        }
        
        .footer-info {
          color: #64748b;
          line-height: 1.8;
        }
        
        ul {
          list-style: none;
          padding: 0;
        }
        
        ul li {
          padding: 8px 0;
          padding-right: 25px;
          position: relative;
        }
        
        ul li:before {
          content: "•";
          color: #3b82f6;
          font-weight: bold;
          font-size: 16pt;
          position: absolute;
          right: 5px;
        }
        
        @media print {
          body { 
            print-color-adjust: exact; 
            -webkit-print-color-adjust: exact; 
          }
        }
      </style>
    </head>
    <body>
      <div class="contract-container">
        <!-- Header -->
        <div class="header">
          <div class="company-name">Mana Smart Trading</div>
          <div class="company-name-ar">شركة مانا الذكية للتجارة</div>
          <div class="company-info">
            <div>سجل تجاري: 2051245473 | C.R.: 2051245473</div>
            <div>مدينة الخبر - المملكة العربية السعودية | Khobar - Saudi Arabia</div>
          </div>
        </div>

        <!-- Contract Title -->
        <div class="contract-title">
          <h1>عقد خدمة التعطير للأعمال</h1>
          <div class="contract-title-ar">Aromatic Service Agreement (Business)</div>
        </div>

        <!-- Contract Details -->
        <div class="contract-details">
          <div>
            <div class="detail-item">
              <span class="detail-label">التاريخ / Date:</span>
              <span class="detail-value">{{contract_date}}</span>
            </div>
          </div>
          <div>
            <div class="detail-item">
              <span class="detail-label">رقم العقد / Contract No.:</span>
              <span class="detail-value">MANA/{{contract_number}}/2025</span>
            </div>
          </div>
        </div>

        <!-- Parties -->
        <div class="parties">
          <div class="bilingual">
            <p class="ar">تم في هذا اليوم بتاريخ <span class="highlight">{{contract_date}}</span> م، الاتفاق بين كل من:</p>
            <p class="en">On this day dated {{contract_date}}, an agreement was made between:</p>
          </div>

          <div class="party-section">
            <div class="party-title">الطرف الأول (المزود) / First Party (Provider)</div>
            <div class="party-info">
              <div class="bilingual">
                <div class="ar"><strong>شركة مانا الذكية للتجارة</strong></div>
                <div class="en">Mana Smart Trading Company</div>
              </div>
              <div class="bilingual">
                <div class="ar">سجل تجاري رقم: 2051245473</div>
                <div class="en">Commercial Registration No.: 2051245473</div>
              </div>
              <div class="bilingual">
                <div class="ar">المقر الرئيسي: مدينة الخبر – المملكة العربية السعودية</div>
                <div class="en">Headquarters: Khobar City - Kingdom of Saudi Arabia</div>
              </div>
              <div class="bilingual">
                <div class="ar">ويُشار إليها لاحقًا بـ "المزود"</div>
                <div class="en">Hereinafter referred to as "the Provider"</div>
              </div>
            </div>
          </div>

          <div class="party-section">
            <div class="party-title">الطرف الثاني (العميل) / Second Party (Client)</div>
            <div class="party-info">
              <div class="bilingual">
                <div class="ar"><strong>شركة/مؤسسة: {{client_name}}</strong></div>
                <div class="en">Company/Establishment: {{client_name}}</div>
              </div>
              <div class="bilingual">
                <div class="ar">سجل تجاري رقم: {{client_cr}}</div>
                <div class="en">Commercial Registration No.: {{client_cr}}</div>
              </div>
              <div class="bilingual">
                <div class="ar">المقر الرئيسي: {{client_city}}</div>
                <div class="en">Headquarters: {{client_city}}</div>
              </div>
              <div class="bilingual">
                <div class="ar">ويُشار إليه لاحقًا بـ "العميل"</div>
                <div class="en">Hereinafter referred to as "the Client"</div>
              </div>
            </div>
          </div>

          <div class="clause-content">
            <div class="bilingual">
              <div class="ar">وبناءً على رغبة الطرفين في التعاون بمجال خدمات التعطير، تم الاتفاق على البنود التالية:</div>
              <div class="en">Based on both parties' desire to cooperate in the field of scenting services, the following terms have been agreed upon:</div>
            </div>
          </div>
        </div>

        <!-- Clauses -->
        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند الأول – موضوع العقد</div>
              <div class="en">Clause 1 – Scope of Agreement</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              يتعهد المزود بتقديم خدمات التعطير باستخدام أجهزة وزيوت عطرية مخصصة تشمل التركيب، التعبئة، الصيانة، والمتابعة، حسب ما هو موضح في هذا العقد وملحق الخدمة.
            </div>
            <div class="clause-content-en">
              The Provider undertakes to provide scenting services using designated devices and aromatic oils, including installation, refilling, maintenance, and follow-up, as outlined in this Agreement and the Service Annex.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند الثاني – مدة العقد</div>
              <div class="en">Clause 2 – Contract Duration</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              مدة العقد سنة ميلادية واحدة تبدأ من تاريخ التوقيع، وتتجدد تلقائيًا ما لم يبلغ أحد الطرفين الآخر برغبته في عدم التجديد قبل (30) يومًا من تاريخ الانتهاء.
            </div>
            <div class="clause-content-en">
              This Agreement is valid for one (1) calendar year starting from the signing date and automatically renews unless either party notifies the other 30 days prior to expiration.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند الثالث – بداية تنفيذ الخدمة</div>
              <div class="en">Clause 3 – Service Commencement</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              يبدأ تنفيذ الخدمة خلال (2–5) أيام عمل من تاريخ توقيع العقد وسداد الدفعة الأولى.
            </div>
            <div class="clause-content-en">
              Service will commence within two (2) to five (5) business days after signing and first payment.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند الرابع – خطة الدفع</div>
              <div class="en">Clause 4 – Payment Plan</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">يتم اختيار إحدى الخطط التالية:</div>
            <div class="clause-content-en">One of the following payment plans will be agreed upon:</div>
            
            <div class="payment-options">
              <div class="payment-option">
                <div class="ar"><strong>شهريًا:</strong> <span class="highlight">{{monthly_fee}}</span> ريال شهريًا</div>
                <div class="en">Monthly: SAR {{monthly_fee}} per month</div>
              </div>
              
              <div class="payment-option">
                <div class="ar"><strong>نصف سنوي (6 أشهر + شهر مجاني):</strong> <span class="highlight">{{semi_annual_fee}}</span> ريال مقدّمًا</div>
                <div class="en">Semi-Annual (6 months + 1 free month): SAR {{semi_annual_fee}} upfront</div>
              </div>
              
              <div class="payment-option">
                <div class="ar"><strong>سنوي (12 شهر + شهرين مجانيين):</strong> <span class="highlight">{{annual_fee}}</span> ريال مقدّمًا</div>
                <div class="en">Annual (12 months + 2 free months): SAR {{annual_fee}} upfront</div>
              </div>
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند الخامس – موقع الخدمة</div>
              <div class="en">Clause 5 – Service Location</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">العنوان: <span class="highlight">{{service_address}}</span></div>
            <div class="clause-content-en">Address: {{service_address_en}}</div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند السادس – العطور وتغيير الروائح</div>
              <div class="en">Clause 6 – Fragrances & Scent Changes</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              يحق للعميل اختيار الروائح من قائمة المزود، ويمكن تغييرها شهريًا حسب التوفر. يلتزم المزود بتوفير روائح عالية الجودة ومناسبة لبيئة العمل.
            </div>
            <div class="clause-content-en">
              The client may select fragrances from the provider's list and request monthly changes based on availability. The provider commits to providing high-quality fragrances suitable for the work environment.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند السابع – الأجهزة وعددها</div>
              <div class="en">Clause 7 – Devices & Quantity</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              عدد الأجهزة: <span class="highlight">{{device_count}}</span><br>
              أنواع الأجهزة: <span class="highlight">{{device_types}}</span>
            </div>
            <div class="clause-content-en">
              Device Quantity: {{device_count}}<br>
              Device Types: {{device_types}}
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند الثامن – التزامات المزود</div>
              <div class="en">Clause 8 – Provider's Obligations</div>
            </div>
          </div>
          <div class="clause-content">
            <ul class="ar">
              <li>تركيب وتشغيل الأجهزة في موقع العميل حسب الاتفاق</li>
              <li>تعبئة الزيوت العطرية دوريًا (شهريًا أو حسب الحاجة)</li>
              <li>توفير الصيانة الدورية والطارئة</li>
              <li>استبدال الجهاز المعطل خلال 48-72 ساعة</li>
              <li>توفير دعم فني واستشاري مستمر</li>
              <li>ضمان جودة وسلامة المنتجات المستخدمة</li>
            </ul>
            <div class="clause-content-en">
              Installation and operation at client's location, periodic oil refilling (monthly or as needed), regular and emergency maintenance, device replacement within 48-72 hours, continuous technical support, and ensuring product quality and safety.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند التاسع – التزامات العميل</div>
              <div class="en">Clause 9 – Client's Obligations</div>
            </div>
          </div>
          <div class="clause-content">
            <ul class="ar">
              <li>تسهيل دخول الفريق الفني لموقع الخدمة</li>
              <li>الالتزام بسداد المستحقات في موعدها المحدد</li>
              <li>عدم نقل أو تعديل الأجهزة دون إذن مكتوب من المزود</li>
              <li>الإبلاغ عن أي خلل أو عطل خلال 24 ساعة</li>
              <li>تعيين مسؤول للتواصل والتنسيق</li>
              <li>توفير مصدر كهرباء مناسب للأجهزة</li>
            </ul>
            <div class="clause-content-en">
              Facilitate technical team access, timely payments, no unauthorized device modifications, report issues within 24 hours, designate a contact person, and provide suitable power supply for devices.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند العاشر – الصيانة والاستجابة</div>
              <div class="en">Clause 10 – Maintenance & Response</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              داخل المدن الرئيسية: خلال 48 ساعة<br>
              في المدن الأخرى: خلال 72 ساعة<br>
              تشمل الصيانة: التعبئة، التنظيف، ضبط الإعدادات، واستبدال القطع التالفة
            </div>
            <div class="clause-content-en">
              Within major cities: within 48 hours<br>
              In other cities: within 72 hours<br>
              Maintenance includes refilling, cleaning, settings adjustment, and part replacement.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند الحادي عشر – إعادة الخدمة بعد الإيقاف</div>
              <div class="en">Clause 11 – Service Resumption</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              يمكن إعادة الخدمة خلال (30) يومًا من تاريخ الإيقاف بعد تسوية جميع المستحقات المالية، وبعد انقضاء هذه المدة يُعتبر العقد مفسوخًا نهائيًا.
            </div>
            <div class="clause-content-en">
              Service may be resumed within 30 days after payment settlement; beyond that period, the contract is considered permanently terminated.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند الثاني عشر – الأعطال المتكررة</div>
              <div class="en">Clause 12 – Repeated Malfunctions</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              إذا تكررت الأعطال في نفس الجهاز أكثر من ثلاث مرات خلال 60 يومًا، يلتزم المزود باستبدال الجهاز بجهاز جديد دون أي تكلفة إضافية على العميل.
            </div>
            <div class="clause-content-en">
              If a device fails more than three times within 60 days, the provider must replace it with a new device at no additional cost to the client.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند الثالث عشر – ملكية الأجهزة</div>
              <div class="en">Clause 13 – Device Ownership</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              الأجهزة والزيوت العطرية تظل ملكًا حصريًا للمزود طيلة مدة العقد وبعد انتهائه، ولا يجوز للعميل الاحتفاظ بها أو استخدامها بعد انتهاء التعاقد.
            </div>
            <div class="clause-content-en">
              Devices and aromatic oils remain exclusive property of the provider throughout and after the contract period. The client may not retain or use them after contract termination.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند الرابع عشر – فسخ العقد</div>
              <div class="en">Clause 14 – Termination</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              يمكن فسخ العقد بإشعار خطي قبل 30 يومًا على الأقل. في حالة فسخ العقد من قبل العميل دون إخلال من المزود، لا يُسترد المبلغ المدفوع مقدمًا.
            </div>
            <div class="clause-content-en">
              Contract may be terminated with 30 days' written notice. Payments are non-refundable if terminated by the client without provider breach.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند الخامس عشر – الضمان</div>
              <div class="en">Clause 15 – Warranty</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              جميع الأجهزة مشمولة بضمان ضد العيوب المصنعية طوال مدة العقد. لا يشمل الضمان الأضرار الناتجة عن سوء الاستخدام أو الحوادث.
            </div>
            <div class="clause-content-en">
              All devices are under warranty against manufacturing defects during the contract period. Warranty does not cover damages from misuse or accidents.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند السادس عشر – تقييم الخدمة</div>
              <div class="en">Clause 16 – Service Evaluation</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              يتم إرسال استبيان تقييم للخدمة كل 3 أشهر لقياس رضا العميل وتحسين جودة الأداء والخدمات المقدمة.
            </div>
            <div class="clause-content-en">
              A service evaluation survey is conducted every 3 months to measure client satisfaction and improve service quality and performance.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند السابع عشر – الزيارات الطارئة</div>
              <div class="en">Clause 17 – Emergency Visits</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              تُحسب الزيارة الطارئة غير المجدولة بقيمة <span class="highlight">{{emergency_visit_fee}}</span> ريال، ما لم يكن السبب عطلاً فنيًا من مسؤولية المزود.
            </div>
            <div class="clause-content-en">
              Unscheduled emergency visit fee: SAR {{emergency_visit_fee}}, unless due to provider's technical fault.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند الثامن عشر – التواصل الرسمي</div>
              <div class="en">Clause 18 – Official Communication</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              Email: sales@mana.sa<br>
              Phone/WhatsApp: +966556292500<br>
              يتم التواصل خلال ساعات العمل الرسمية من الأحد إلى الخميس (9 صباحاً - 6 مساءً)
            </div>
            <div class="clause-content-en">
              Email: sales@mana.sa<br>
              Phone/WhatsApp: +966556292500<br>
              Communication during official working hours: Sunday to Thursday (9 AM - 6 PM)
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند التاسع عشر – النظام القضائي</div>
              <div class="en">Clause 19 – Legal Jurisdiction</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              تخضع هذه الاتفاقية لأنظمة وقوانين المملكة العربية السعودية، وتختص المحكمة التجارية في مدينة الخبر بالنظر في أي نزاع ينشأ عن هذا العقد.
            </div>
            <div class="clause-content-en">
              This Agreement is governed by the laws and regulations of the Kingdom of Saudi Arabia; the Commercial Court in Khobar shall have exclusive jurisdiction over any disputes arising from this contract.
            </div>
          </div>
        </div>

        <div class="clause">
          <div class="clause-header">
            <div class="bilingual">
              <div class="ar">البند العشرون – اللغة والنسخ</div>
              <div class="en">Clause 20 – Language & Copies</div>
            </div>
          </div>
          <div class="clause-content">
            <div class="ar">
              تم تحرير هذه الاتفاقية باللغتين العربية والإنجليزية على نسختين أصليتين، لكل طرف نسخة. وتُعتمد النسخة العربية عند الاختلاف في التفسير.
            </div>
            <div class="clause-content-en">
              This Agreement is written in Arabic and English in two original copies, one for each party. The Arabic version shall prevail in case of interpretation differences.
            </div>
          </div>
        </div>

        <!-- Signatures -->
        <div class="signatures">
          <div class="party-title" style="text-align: center; margin-bottom: 30px;">التوقيعات / Signatures</div>
          
          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-title">الطرف الأول (المزود)<br><span style="font-size: 11pt; color: #64748b;">First Party (Provider)</span></div>
              <div class="signature-field">
                <span class="signature-label">شركة مانا الذكية للتجارة<br>Mana Smart Trading Company</span>
              </div>
              <div class="signature-field">
                <span class="signature-label">يمثلها: المهندس زياد عبدالله الغامدي<br>Represented by: Eng. Ziyad Abdullah Al-Ghamdi</span>
              </div>
              <div class="signature-field">
                <span class="signature-label">الصفة: المدير التنفيذي<br>Position: CEO</span>
              </div>
              <div class="signature-field">
                <span class="signature-label">التوقيع / Signature:</span>
                <div class="signature-line"></div>
              </div>
              <div class="signature-field">
                <span class="signature-label">الختم / Stamp:</span>
                <div class="signature-line"></div>
              </div>
            </div>

            <div class="signature-box">
              <div class="signature-title">الطرف الثاني (العميل)<br><span style="font-size: 11pt; color: #64748b;">Second Party (Client)</span></div>
              <div class="signature-field">
                <span class="signature-label">شركة/مؤسسة: {{client_name}}<br>Company/Establishment: {{client_name}}</span>
              </div>
              <div class="signature-field">
                <span class="signature-label">يمثلها: {{client_representative}}<br>Represented by: {{client_representative}}</span>
              </div>
              <div class="signature-field">
                <span class="signature-label">الصفة: {{client_position}}<br>Position: {{client_position}}</span>
              </div>
              <div class="signature-field">
                <span class="signature-label">التوقيع / Signature:</span>
                <div class="signature-line"></div>
              </div>
              <div class="signature-field">
                <span class="signature-label">الختم / Stamp:</span>
                <div class="signature-line"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="footer-title">شكراً لثقتكم بنا / Thank You for Your Trust</div>
          <div class="footer-info">
            <div>للاستفسار يرجى التواصل معنا / For inquiries, please contact us:</div>
            <div>Phone: +966 556 292 500 | Email: sales@mana.sa</div>
            <div>www.mana.sa</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return replaceVariables(template);
};
