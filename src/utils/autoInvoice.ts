import { supabase } from "../lib/supabaseClient";
import type { Invoices as InvoicesRow } from "../../supabase/models/invoices";

const VAT_RATE = 0.15;
const AUTO_INVOICE_ENABLED_KEY = 'autoInvoiceEnabled';
const AUTO_INVOICE_TIMING_KEY = 'autoInvoiceTiming';

/**
 * Generate automatic invoice for monthly visit
 * This function is called when a monthly visit is created for a customer with an active contract
 */
export async function generateAutomaticInvoice(
  customerId: string,
  contractId: string,
  visitDate: string,
  paymentPlan: "monthly" | "semi-annual" | "annual",
  monthlyAmount: number,
  semiAnnualAmount: number,
  annualAmount: number,
  dispatch: any,
  thunks: any
): Promise<void> {
  try {
    // Check if automatic invoicing is enabled
    const enabled = localStorage.getItem(AUTO_INVOICE_ENABLED_KEY) === 'true';
    if (!enabled) {
      return; // Don't generate invoice if disabled
    }

    // Get customer details
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_id', customerId)
      .maybeSingle();

    if (customerError || !customer) {
      console.error('Customer not found for automatic invoice', customerError);
      return;
    }

    // Get contract details
    const { data: contractData, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('contract_id', contractId)
      .maybeSingle();

    if (contractError || !contractData) {
      console.error('Contract not found for automatic invoice', contractError);
      return;
    }

    // Parse contract additional data
    try {
      if (contractData.notes) {
        JSON.parse(contractData.notes);
      }
    } catch (e) {
      // If notes is not JSON, use defaults
    }

    // Determine invoice amount based on payment plan
    // For monthly visits, we invoice the monthly portion of the payment plan
    let invoiceAmount = 0;
    if (paymentPlan === "monthly") {
      invoiceAmount = monthlyAmount;
    } else if (paymentPlan === "semi-annual") {
      // For semi-annual plan, invoice monthly portion (semi-annual amount / 6)
      invoiceAmount = semiAnnualAmount / 6;
    } else {
      // For annual plan, invoice monthly portion (annual amount / 12)
      invoiceAmount = annualAmount / 12;
    }

    if (invoiceAmount <= 0) {
      console.warn('Invoice amount is 0 or negative, skipping automatic invoice');
      return;
    }

    // Calculate invoice date based on timing setting
    const timing = localStorage.getItem(AUTO_INVOICE_TIMING_KEY) || 'visit_date';
    let invoiceDate = visitDate;
    if (timing === '7_days_before') {
      const visitDateObj = new Date(visitDate);
      visitDateObj.setDate(visitDateObj.getDate() - 7);
      invoiceDate = visitDateObj.toISOString().split('T')[0];
    }

    // Check if invoice already exists for this contract and visit date
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('invoice_id')
      .eq('contract_id', contractId)
      .eq('invoice_date', invoiceDate);

    if (existingInvoices && existingInvoices.length > 0) {
      console.log('Invoice already exists for this contract and date, skipping');
      return;
    }

    // Calculate totals
    const subtotal = invoiceAmount;
    const taxAmount = subtotal * VAT_RATE;
    const totalAmount = subtotal + taxAmount;
    const paidAmount = 0; // Initial payment is $0

    // Create invoice item with proper description
    const planName = paymentPlan === 'monthly' ? 'Monthly' : paymentPlan === 'semi-annual' ? 'Semi-Annual' : 'Annual';
    const invoiceItem = {
      id: 1,
      description: `Monthly service payment - ${planName} plan for visit on ${visitDate}`,
      quantity: 1,
      unitPrice: invoiceAmount,
      discountPercent: 0,
      priceAfterDiscount: invoiceAmount,
      subtotal: invoiceAmount,
      vat: taxAmount,
      total: totalAmount,
      image: null,
    };

    // Generate invoice number
    const year = new Date(invoiceDate).getFullYear();
    const { data: allInvoices } = await supabase
      .from('invoices')
      .select('invoice_id, invoice_date, created_at')
      .order('invoice_date', { ascending: true });

    const sortedInvoices = (allInvoices || []).sort((a, b) => {
      const dateA = new Date(a.invoice_date || a.created_at || 0).getTime();
      const dateB = new Date(b.invoice_date || b.created_at || 0).getTime();
      return dateA - dateB;
    });

    const sequence = sortedInvoices.length + 1;
    const invoiceNumber = `INV-${year}-${String(sequence).padStart(3, "0")}`;

    // Create invoice payload
    const invoicePayload: Partial<InvoicesRow> = {
      customer_id: customerId,
      contract_id: contractId, // This marks it as a monthly visit invoice
      invoice_items: [invoiceItem],
      invoice_date: invoiceDate,
      due_date: visitDate, // Due date is the visit date
      tax_rate: VAT_RATE,
      subtotal: subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      invoice_notes: `Automatic monthly visit invoice generated for visit on ${visitDate}. Payment plan: ${paymentPlan}`,
      payment_status: 'draft', // Status is "draft" (unpaid)
      delegate_id: contractData.delegate_id || customer.delegate_id || null,
    };

    // Create invoice
    await dispatch(thunks.invoices.createOne(invoicePayload)).unwrap();
    await dispatch(thunks.invoices.fetchAll(undefined));

    console.log(`Automatic invoice generated: ${invoiceNumber} for customer ${customer.customer_name}`);
  } catch (error: any) {
    console.error('Failed to generate automatic invoice:', error);
    // Don't show toast to user as this is automatic background process
  }
}

