import type {
	MessageTemplateCategory,
	MessageTemplateType,
} from "../../supabase/models/message_templates";

export interface MessageTemplateSeed {
	id: string;
	name: string;
	type: MessageTemplateType;
	category: MessageTemplateCategory;
	subject?: string;
	content: string;
	variables: string[];
}

export const mockMessageTemplates: MessageTemplateSeed[] = [
	{
		id: "template-1",
		name: "Payment Reminder - Friendly",
		type: "whatsapp",
		category: "payment-reminder",
		content:
			"Hello {{customer_name}}! 👋\n\nThis is a friendly reminder that invoice #{{invoice_number}} for {{amount}} is due on {{due_date}}.\n\nYou can make payment via:\n💳 Bank Transfer\n💵 Cash\n✅ Online Payment\n\nThank you for your business!\nScent System Team",
		variables: ["customer_name", "invoice_number", "amount", "due_date"],
	},
	{
		id: "template-2",
		name: "Monthly Invoice - Email",
		type: "email",
		category: "invoice",
		subject: "Your Monthly Invoice #{{invoice_number}} - Scent System",
		content:
			"Dear {{customer_name}},\n\nThank you for choosing Scent System for your scent solutions.\n\nPlease find attached your invoice for this month:\n- Invoice Number: {{invoice_number}}\n- Amount: {{amount}}\n- Due Date: {{due_date}}\n\nServices included:\n{{services_list}}\n\nFor any questions, please don't hesitate to contact us.\n\nBest regards,\nScent System Team\nPhone: +966 50 123 4567\nEmail: info@scentsystem.com",
		variables: ["customer_name", "invoice_number", "amount", "due_date", "services_list"],
	},
	{
		id: "template-3",
		name: "Welcome New Customer",
		type: "whatsapp",
		category: "welcome",
		content:
			"Welcome to Scent System, {{customer_name}}! 🎉\n\nWe're excited to have you as our valued customer.\n\nYour account has been created successfully:\n📋 Customer ID: {{customer_id}}\n📅 Start Date: {{start_date}}\n👤 Account Manager: {{manager_name}}\n\nWe'll be in touch soon to schedule your first visit.\n\nThank you for choosing us! 🌸",
		variables: ["customer_name", "customer_id", "start_date", "manager_name"],
	},
	{
		id: "template-4",
		name: "Visit Reminder - 24hrs",
		type: "whatsapp",
		category: "visit-reminder",
		content:
			"Hello {{customer_name}}! 📅\n\nReminder: We have a scheduled visit tomorrow:\n🕐 Time: {{visit_time}}\n📍 Location: {{location}}\n👤 Representative: {{rep_name}}\n\nPlease ensure access to all areas.\nIf you need to reschedule, let us know!\n\nSee you tomorrow! 🌟",
		variables: ["customer_name", "visit_time", "location", "rep_name"],
	},
	{
		id: "template-5",
		name: "Contract Renewal Notice",
		type: "email",
		category: "contract",
		subject: "Contract Renewal - {{customer_name}}",
		content:
			"Dear {{customer_name}},\n\nYour contract #{{contract_number}} is due for renewal on {{renewal_date}}.\n\nCurrent Plan: {{plan_name}}\nMonthly Fee: {{monthly_fee}}\n\nWe'd like to discuss:\n✓ Renewal terms\n✓ Service improvements\n✓ Special offers for loyal customers\n\nPlease contact us at your earliest convenience.\n\nBest regards,\nScent System Team",
		variables: ["customer_name", "contract_number", "renewal_date", "plan_name", "monthly_fee"],
	},
	{
		id: "template-6",
		name: "Payment Received - Thank You",
		type: "whatsapp",
		category: "payment-reminder",
		content:
			"Thank you {{customer_name}}! 🙏\n\nWe've received your payment of {{amount}} for invoice #{{invoice_number}}.\n\nReceipt: {{receipt_number}}\nDate: {{payment_date}}\n\nYour account is now up to date. We appreciate your prompt payment!\n\nHave a great day! 🌟",
		variables: ["customer_name", "amount", "invoice_number", "receipt_number", "payment_date"],
	},
];


