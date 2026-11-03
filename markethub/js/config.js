// MarketHub config — publishable key is safe for browser use; protect data with RLS.
export const SUPABASE_URL = 'https://tidpqnqenlvptwghipzo.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_MHy-88JT1xaPSPr6UBjMfw_5QYnyocZ';

export const CITIES = ['Lusaka','Kitwe','Ndola','Livingstone','Kabwe','Chipata','Other'];
export const CATEGORIES = [
  'Phones & Electronics','Fashion','Home & Furniture','Vehicles','Property','Appliances','Other'
];

export const DEMO_ITEMS = [
  {id:1,title:"Samsung Galaxy S22 • 128GB",price:4200,category:"Phones & Electronics",location:"Lusaka",condition:"Used - good",emoji:"📱",seller:"Mwamba Tech",phone:"0977000001",desc:"Clean phone in good working condition. Meet to test before buying.",time:Date.now()-100000},
  {id:2,title:"Modern 3-seater sofa",price:2800,category:"Home & Furniture",location:"Lusaka",condition:"Used - good",emoji:"🛋️",seller:"Chola Home",phone:"0977000002",desc:"Comfortable sofa, ideal for a sitting room or apartment.",time:Date.now()-200000},
  {id:3,title:"Nike Air sneakers",price:650,category:"Fashion",location:"Kitwe",condition:"Like new",emoji:"👟",seller:"Tasha Closet",phone:"0977000003",desc:"Stylish sneakers. Check sizing with seller.",time:Date.now()-300000},
  {id:4,title:"HP EliteBook 840 G7",price:5800,category:"Phones & Electronics",location:"Lusaka",condition:"Used - good",emoji:"💻",seller:"Laptop Zone",phone:"0977000004",desc:"Business laptop, SSD storage and webcam. Ask seller for full specs.",time:Date.now()-400000},
  {id:5,title:"Toyota Corolla 2012",price:78000,category:"Vehicles",location:"Ndola",condition:"Used - good",emoji:"🚗",seller:"Banda Motors",phone:"0977000005",desc:"Used vehicle listing. Inspect documents and vehicle before payment.",time:Date.now()-500000},
  {id:6,title:"Double-door refrigerator",price:3900,category:"Appliances",location:"Livingstone",condition:"Used - good",emoji:"🧊",seller:"Misozi Deals",phone:"0977000006",desc:"Working refrigerator. Buyer can arrange collection.",time:Date.now()-600000},
  {id:7,title:"Studio apartment listing",price:2500,category:"Property",location:"Lusaka",condition:"New",emoji:"🏠",seller:"City Rentals",phone:"0977000007",desc:"Monthly rent advertised. Confirm viewing, address and all fees directly.",time:Date.now()-700000},
  {id:8,title:"Bluetooth headphones",price:350,category:"Phones & Electronics",location:"Kabwe",condition:"New",emoji:"🎧",seller:"Kabwe Gadgets",phone:"0977000008",desc:"Wireless headphones. Ask seller about battery life and warranty.",time:Date.now()-800000},
  {id:9,title:"Dining table with 4 chairs",price:1700,category:"Home & Furniture",location:"Chipata",condition:"Used - good",emoji:"🪑",seller:"Lulu Furniture",phone:"0977000009",desc:"Dining set in good condition. Collection preferred.",time:Date.now()-900000},
  {id:10,title:"Smart television 43 inch",price:3200,category:"Appliances",location:"Lusaka",condition:"Like new",emoji:"📺",seller:"Bright Electronics",phone:"0977000010",desc:"Smart TV with streaming apps. Test screen and remote before paying.",time:Date.now()-1000000},
  {id:11,title:"Ladies handbag",price:280,category:"Fashion",location:"Kitwe",condition:"New",emoji:"👜",seller:"Nelly Styles",phone:"0977000011",desc:"Everyday handbag. Message seller for available colours.",time:Date.now()-1100000},
  {id:12,title:"Mountain bicycle",price:1400,category:"Other",location:"Ndola",condition:"Used - good",emoji:"🚲",seller:"Tembo Traders",phone:"0977000012",desc:"Suitable for commuting and recreational rides.",time:Date.now()-1200000}
];
