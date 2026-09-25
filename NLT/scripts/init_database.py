"""
Initialize NodeLine Tech database with sample data
"""

from .database import DatabaseManager
import os

def init_sample_data():
    """Initialize database with sample data for testing"""
    db = DatabaseManager()
    
    print("Adding sample products...")
    
    # Sample products for NodeLine Tech
    products = [
        {
            'sku': 'NLT-WM001',
            'name': 'UltraGrip Wireless Mouse',
            'description': 'Ergonomic wireless mouse with precision tracking and 18-month battery life',
            'category': 'Mice',
            'price': 49.99,
            'features': 'Wireless, Ergonomic, Long Battery Life, Precision Tracking',
            'specifications': '2.4GHz wireless, 1600 DPI, 18-month battery, USB receiver',
            'warranty_months': 24
        },
        {
            'sku': 'NLT-KB002',
            'name': 'StreamType Wireless Keyboard',
            'description': 'Full-size wireless keyboard with quiet keys and backlighting',
            'category': 'Keyboards',
            'price': 79.99,
            'features': 'Wireless, Backlit, Quiet Keys, Full Size',
            'specifications': '2.4GHz wireless, Backlit keys, Low-profile switches, USB-C charging',
            'warranty_months': 24
        },
        {
            'sku': 'NLT-HP003',
            'name': 'SoundFree Wireless Headphones',
            'description': 'Premium wireless headphones with active noise cancellation',
            'category': 'Headphones',
            'price': 199.99,
            'features': 'Wireless, Noise Cancelling, Premium Audio, Long Battery',
            'specifications': 'Bluetooth 5.0, 30-hour battery, Active noise cancelling, Comfortable ear cups',
            'warranty_months': 12
        },
        {
            'sku': 'NLT-WC004',
            'name': 'PowerFlow Wireless Charger',
            'description': 'Fast wireless charging pad for smartphones and devices',
            'category': 'Chargers',
            'price': 39.99,
            'features': 'Fast Charging, Universal Compatibility, LED Indicator',
            'specifications': '15W fast charging, Qi compatible, LED status indicator',
            'warranty_months': 12
        },
        {
            'sku': 'NLT-SP005',
            'name': 'BoomBox Wireless Speaker',
            'description': 'Portable Bluetooth speaker with 360-degree sound',
            'category': 'Speakers',
            'price': 89.99,
            'features': 'Portable, 360-degree Sound, Waterproof, Long Battery',
            'specifications': 'Bluetooth 5.0, 20-hour battery, IPX7 waterproof, 360-degree audio',
            'warranty_months': 18
        }
    ]
    
    with db.get_connection() as conn:
        cursor = conn.cursor()
        for product in products:
            cursor.execute('''
                INSERT OR REPLACE INTO products 
                (sku, name, description, category, price, features, specifications, warranty_months)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (product['sku'], product['name'], product['description'], product['category'],
                  product['price'], product['features'], product['specifications'], product['warranty_months']))
        conn.commit()
    
    print("Adding sample knowledge base articles...")
    
    # Sample knowledge base articles
    kb_articles = [
        {
            'title': 'How to Connect Your Wireless Mouse',
            'content': '''
To connect your NodeLine Tech wireless mouse:

1. Insert the batteries into your mouse (2 AA batteries)
2. Plug the USB receiver into an available USB port on your computer
3. Turn on the mouse using the power switch on the bottom
4. Wait 2-3 seconds for automatic pairing
5. Test the mouse movement and clicks

If the mouse doesn't connect immediately:
- Try moving the USB receiver to a different port
- Make sure the mouse is within 10 feet of the receiver
- Check that the batteries are properly installed
- Press the connect button on both the mouse and receiver

The mouse will automatically enter sleep mode after 10 minutes of inactivity to preserve battery life.
            ''',
            'category': 'Setup Guides',
            'subcategory': 'Mice',
            'tags': 'wireless, mouse, connection, setup, pairing',
            'document_type': 'manual',
            'author': 'NLT Support Team'
        },
        {
            'title': 'Keyboard Not Responding - Troubleshooting',
            'content': '''
If your wireless keyboard is not responding:

**Check the Basics:**
1. Ensure the keyboard is turned on (check power switch)
2. Verify the USB receiver is properly connected
3. Check battery level (low battery indicator will show)
4. Make sure you're within range (30 feet maximum)

**Try These Solutions:**
1. Re-sync the keyboard:
   - Press and hold the Connect button on the receiver for 3 seconds
   - Press the Connect button on the back of the keyboard
   - Wait for the LED to stop blinking

2. Replace batteries:
   - Use fresh AA batteries
   - Ensure proper polarity (+/- orientation)

3. Test on another computer:
   - This helps determine if it's a hardware issue

4. Clean the keyboard:
   - Use compressed air to remove debris
   - Wipe with slightly damp cloth

If problems persist, contact our support team with your product serial number.
            ''',
            'category': 'Troubleshooting',
            'subcategory': 'Keyboards',
            'tags': 'keyboard, troubleshooting, not responding, wireless, connection',
            'document_type': 'article',
            'author': 'NLT Support Team'
        },
        {
            'title': 'Wireless Headphone Audio Quality Issues',
            'content': '''
To improve audio quality on your wireless headphones:

**Common Audio Issues:**

1. **Crackling or Static:**
   - Move closer to your device (reduce interference)
   - Check for other wireless devices causing interference
   - Ensure headphones are fully charged
   - Try different audio source

2. **Low Volume:**
   - Check volume on both device and headphones
   - Ensure headphones are not in power-saving mode
   - Clean headphone drivers with soft cloth

3. **Audio Cutting Out:**
   - Stay within 30-foot range of connected device
   - Remove obstacles between headphones and device
   - Reset Bluetooth connection
   - Update device drivers

**Reset Instructions:**
1. Turn off headphones
2. Hold power button for 10 seconds until LED flashes red/blue alternately
3. Re-pair with your device

**Optimal Settings:**
- Use high-quality audio codecs (aptX, AAC)
- Keep devices updated
- Avoid interference from WiFi routers, microwaves
            ''',
            'category': 'Troubleshooting',
            'subcategory': 'Headphones',
            'tags': 'headphones, audio quality, bluetooth, crackling, volume, wireless',
            'document_type': 'article',
            'author': 'NLT Support Team'
        },
        {
            'title': 'Warranty and Return Policy',
            'content': '''
**NodeLine Tech Warranty Policy**

**Standard Warranty Coverage:**
- Mice and Keyboards: 24 months
- Headphones and Speakers: 12-18 months (varies by model)
- Chargers and Accessories: 12 months

**What's Covered:**
- Manufacturing defects
- Hardware failures under normal use
- Battery-related issues (first 6 months)

**What's NOT Covered:**
- Physical damage from drops or spills
- Battery degradation after 6 months
- Damage from misuse or modifications
- Normal wear and tear

**How to Make a Warranty Claim:**
1. Contact our support team with:
   - Product serial number
   - Purchase date and receipt
   - Description of the issue
2. We'll provide troubleshooting steps
3. If unresolved, we'll issue an RMA number
4. Ship the product back using provided prepaid label
5. Receive replacement within 5-7 business days

**Return Policy:**
- 30-day return window from purchase date
- Products must be in original condition
- Original packaging required
- Restocking fee may apply for opened software items

For warranty claims, email support@nodelinetech.com or call 1-800-NLT-HELP
            ''',
            'category': 'Policies',
            'subcategory': 'Warranty',
            'tags': 'warranty, return, policy, RMA, coverage, claim',
            'document_type': 'policy',
            'author': 'NLT Legal Team'
        },
        {
            'title': 'Battery Life and Charging Best Practices',
            'content': '''
**Maximizing Battery Life for Your Wireless Devices**

**General Tips:**
1. **First Use:** Fully charge new devices before first use
2. **Storage:** Store devices at 50% charge if not using for extended periods
3. **Temperature:** Avoid extreme hot or cold temperatures
4. **Regular Use:** Use devices regularly to maintain battery health

**Device-Specific Guidelines:**

**Mice:**
- Expected life: 12-18 months with AA batteries
- Use high-quality alkaline or lithium batteries
- Turn off when not in use for extended periods
- Replace both batteries at the same time

**Keyboards:**
- Expected life: 6-12 months with AA batteries
- Turn off backlighting when not needed
- Use auto-sleep feature
- Consider rechargeable batteries for heavy use

**Headphones:**
- Charge cycles: 500+ full charges expected
- Don't leave plugged in after reaching 100%
- Use original charging cable
- Charge before battery completely drains

**Speakers:**
- Expected life: 15-20 hours per charge
- Avoid overcharging (unplug when full)
- Use moderate volume levels to extend battery life
- Store at room temperature

**Warning Signs of Battery Issues:**
- Significantly reduced operating time
- Device randomly shutting off
- Charging indicator not working properly
- Swollen battery (discontinue use immediately)

Contact support if you experience battery issues within the warranty period.
            ''',
            'category': 'Maintenance',
            'subcategory': 'Battery Care',
            'tags': 'battery, charging, life, maintenance, care, wireless',
            'document_type': 'article',
            'author': 'NLT Support Team'
        }
    ]
    
    for article in kb_articles:
        db.add_knowledge_base_document(
            title=article['title'],
            content=article['content'],
            category=article['category'],
            subcategory=article['subcategory'],
            tags=article['tags'],
            document_type=article['document_type'],
            author=article['author']
        )
    
    print("Adding sample FAQ entries...")
    
    # Sample FAQ entries
    faqs = [
        {
            'title': 'How long do wireless device batteries last?',
            'content': 'Battery life varies by device: Mice (12-18 months), Keyboards (6-12 months), Headphones (20+ hours per charge), Speakers (15-20 hours per charge). Actual life depends on usage patterns and settings.',
            'category': 'FAQ',
            'subcategory': 'Battery',
            'tags': 'battery, life, duration, FAQ',
            'document_type': 'faq'
        },
        {
            'title': 'What if my wireless device won\'t connect?',
            'content': 'First, ensure the device is on and within range (30 feet). Check that the USB receiver is properly connected. Try re-syncing by pressing the connect buttons on both devices. If issues persist, try fresh batteries or contact support.',
            'category': 'FAQ',
            'subcategory': 'Connection',
            'tags': 'connection, pairing, wireless, troubleshooting, FAQ',
            'document_type': 'faq'
        },
        {
            'title': 'Do you offer international shipping?',
            'content': 'Yes, we ship to most countries worldwide. International shipping typically takes 7-14 business days. Additional customs fees may apply depending on your location. Free shipping is available for orders over $75 within the US.',
            'category': 'FAQ',
            'subcategory': 'Shipping',
            'tags': 'shipping, international, delivery, FAQ',
            'document_type': 'faq'
        },
        {
            'title': 'How do I update firmware on my devices?',
            'content': 'Most NodeLine Tech devices don\'t require firmware updates. However, if updates are available, we\'ll notify customers via email and provide download links and instructions on our support website.',
            'category': 'FAQ',
            'subcategory': 'Updates',
            'tags': 'firmware, updates, software, FAQ',
            'document_type': 'faq'
        }
    ]
    
    for faq in faqs:
        db.add_knowledge_base_document(
            title=faq['title'],
            content=faq['content'],
            category=faq['category'],
            subcategory=faq['subcategory'],
            tags=faq['tags'],
            document_type=faq['document_type'],
            author='NLT Support Team'
        )
    
    print("Creating sample admin user...")
    
    # Create a sample admin user for testing
    admin_user_id = db.create_user(
        email='admin@nodelinetech.com',
        first_name='Admin',
        last_name='User',
        password='admin123',  # Change this in production!
        company='NodeLine Tech'
    )
    
    if admin_user_id:
        print(f"Created admin user with ID: {admin_user_id}")
        # Set admin role for the new user
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE users SET role = "admin" WHERE id = ?', (admin_user_id,))
            conn.commit()
            print("Set admin role for admin user")
    else:
        print("Admin user already exists")
    
    # Create a sample customer user
    customer_user_id = db.create_user(
        email='customer@example.com',
        first_name='John',
        last_name='Customer',
        password='customer123',
        phone='555-0123',
        company='Example Corp'
    )
    
    if customer_user_id:
        print(f"Created customer user with ID: {customer_user_id}")
    else:
        print("Customer user already exists")
    
    print("\nDatabase initialization complete!")
    print("\nSample users created:")
    print("- Admin: admin@nodelinetech.com / admin123")
    print("- Customer: customer@example.com / customer123")
    print("\nDatabase contains:")
    print("- 5 sample products")
    print("- 9 knowledge base articles/FAQs")
    print("- Complete schema for users, sessions, conversations, tickets, and more")

if __name__ == "__main__":
    init_sample_data()
