import { useState, useEffect } from 'react'
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import Modal from './components/Modal'
import Toast from './components/Toast'
import ProductDetails from './components/ProductDetails'
import Dashboard from './pages/Dashboard'
import BuyBorrow from './pages/BuyBorrow'
import SellLend from './pages/SellLend'
import MyListings from './pages/MyListings'
import Messages from './pages/Messages'
import Transactions from './pages/Transactions'
import Profile from './pages/Profile'
import AdminModeration from './pages/AdminModeration'
import AuthPage from './pages/Auth'
import AuthCallback from './pages/AuthCallback'
import Notifications from './pages/Notifications'
import { api, loadRazorpay } from './api'
import { hydrateListing } from './data/mockData'
import { useAuth } from './auth'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-8 text-sm text-ink-soft">Checking session…</div>
  if (!user) return <Navigate to="/auth" replace />
  if (!user.verified) return <Navigate to="/auth" replace />
  return children
}

export default function App() {
  const location = useLocation()
  const { user, loading } = useAuth()
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [favorites, setFavorites] = useState([])
  const [activeProduct, setActiveProduct] = useState(null)
  const [toast, setToast] = useState({ show: false, message: '' })
  const [myListings, setMyListings] = useState([])
  const [apiReady, setApiReady] = useState(null)
  const [payOrder, setPayOrder] = useState(null)

  useEffect(() => {
    api.health().then(() => setApiReady(true)).catch(() => setApiReady(false))
  }, [])

  useEffect(() => {
    if (!user) return
    api.getWatchlist().then((rows) => setFavorites(rows.map((r) => r.listingId))).catch(() => {})
  }, [user])

  const toggleFavorite = async (id) => {
    const exists = favorites.includes(id)
    setFavorites((favs) => (exists ? favs.filter((f) => f !== id) : [...favs, id]))
    try {
      if (exists) await api.removeWatchlist(id)
      else await api.addWatchlist(id)
    } catch {
      setToast({ show: true, message: 'Could not update watchlist' })
    }
  }

  const showToast = (message) => setToast({ show: true, message })

  const handleProductAction = async (kind) => {
    const product = activeProduct
    if (kind === 'chat') {
      try {
        await api.createMessage({
          preview: `Hi! I'm interested in "${product?.title}".`,
          item: product?.title || '',
          listingId: product?.id,
          toUserId: product?.seller?.userId,
        })
        showToast('Message sent to seller 💬')
      } catch (err) {
        showToast(err.message || 'Could not send message')
      }
      setActiveProduct(null)
      return
    }

    if (product?.type === 'lend') {
      try {
        const days = Number(product.defaultDueDays || 7)
        await api.createTransaction({ listingId: product.id, type: 'borrow', dueDays: days })
        showToast('Borrow request sent — waiting for lender approval')
      } catch (err) {
        showToast(err.message)
      }
      setActiveProduct(null)
      return
    }

    try {
      const order = await api.createOrder({ listingId: product.id })
      setPayOrder(order)
      showToast('Payment order created — complete checkout to finish')
    } catch (err) {
      showToast(err.message)
    }
    setActiveProduct(null)
  }

  const handlePublish = (listing) => {
    setMyListings((l) => [hydrateListing(listing), ...l])
    showToast(listing.status === 'held' ? 'Listing held for admin review' : 'Listing saved to MongoDB ✓')
  }

  const startRazorpay = async (order) => {
    try {
      const Razorpay = await loadRazorpay()
      const checkout = new Razorpay({
        key: order.keyId,
        amount: Math.round(Number(order.amount) * 100),
        currency: order.currency || 'INR',
        order_id: order.orderId,
        name: 'Campus Marketplace',
        description: 'Verified campus listing payment',
        handler: async (response) => {
          try {
            await api.verifyPayment({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            })
            showToast('Payment verified by the server ✓')
          } catch (err) {
            showToast(err.message || 'Payment verification failed')
          }
          setPayOrder(null)
        },
        modal: {
          ondismiss: async () => {
            try {
              await api.verifyPayment({ orderId: order.orderId, status: 'cancelled' })
            } catch {
              /* ignore */
            }
            showToast('Payment cancelled')
            setPayOrder(null)
          },
        },
      })
      checkout.on('payment.failed', async (resp) => {
        try {
          await api.verifyPayment({ orderId: order.orderId, status: 'failed' })
        } catch {
          /* ignore */
        }
        showToast(resp?.error?.description || 'Payment failed')
        setPayOrder(null)
      })
      checkout.open()
    } catch (err) {
      showToast(err.message || 'Could not open Razorpay checkout')
    }
  }

  const completeDevPay = async (outcome) => {
    try {
      const signed = await api.devCompletePayment({ orderId: payOrder.orderId, outcome })
      if (outcome !== 'success') {
        await api.verifyPayment({ ...signed, status: outcome === 'cancel' ? 'cancelled' : 'failed' }).catch(() => {})
        showToast(outcome === 'cancel' ? 'Payment cancelled' : 'Payment failed')
        setPayOrder(null)
        return
      }
      await api.verifyPayment(signed)
      showToast('Payment verified by the server ✓')
    } catch (err) {
      showToast(err.message || 'Payment verification failed')
    }
    setPayOrder(null)
  }

  if (!loading && !user && location.pathname !== '/auth' && location.pathname !== '/auth/callback') {
    return <Navigate to="/auth" replace />
  }

  return (
    <div className="min-h-screen">
      {user && <Navbar search={search} setSearch={setSearch} onMenuClick={() => setSidebarOpen(true)} />}
      {apiReady === false && (
        <div className="bg-coral-bg border-b border-coral-ink/30 text-coral-ink text-xs md:text-sm px-4 py-2 text-center">
          Backend API is offline. Start it with <code className="font-mono">npm run server</code> in the project root.
        </div>
      )}
      <div className="md:flex">
        {user && <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />}
        <main className="flex-1 min-w-0">
          <Routes location={location} key={location.pathname}>
            <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/" element={<Protected><Dashboard favorites={favorites} onToggleFavorite={toggleFavorite} onOpenProduct={setActiveProduct} /></Protected>} />
            <Route path="/buy-borrow" element={<Protected><BuyBorrow search={search} favorites={favorites} onToggleFavorite={toggleFavorite} onOpenProduct={setActiveProduct} /></Protected>} />
            <Route path="/sell-lend" element={<Protected><SellLend onPublish={handlePublish} /></Protected>} />
            <Route path="/my-listings" element={<Protected><MyListings myListings={myListings} onOpenProduct={setActiveProduct} /></Protected>} />
            <Route path="/messages" element={<Protected><Messages /></Protected>} />
            <Route path="/transactions" element={<Protected><Transactions /></Protected>} />
            <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
            <Route path="/profile" element={<Protected><Profile /></Protected>} />
            <Route path="/admin" element={<Protected><AdminModeration /></Protected>} />
          </Routes>
        </main>
      </div>

      <Modal open={!!activeProduct} onClose={() => setActiveProduct(null)} wide>
        {activeProduct && (
          <ProductDetails
            item={activeProduct}
            actionLabel={activeProduct.type === 'lend' ? 'Request to borrow' : 'Pay & buy'}
            onRequestAction={handleProductAction}
          />
        )}
      </Modal>

      <Modal open={!!payOrder} onClose={() => setPayOrder(null)}>
        {payOrder && (
          <div className="p-5">
            <h2 className="font-display font-bold text-lg mb-2">Checkout</h2>
            <p className="text-sm text-ink-soft mb-3">Amount: ₹{payOrder.amount} · Order {payOrder.orderId}</p>
            {payOrder.provider === 'dev' ? (
              <>
                <p className="text-xs text-yellow-ink bg-yellow-bg border border-yellow-ink/30 rounded-md p-2 mb-4">
                  Development payment mode — no money is collected. This is not a successful Razorpay payment. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable real test checkout. The backend still verifies a signed payload.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => completeDevPay('success')} className="flex-1 bg-ink text-paper rounded-full py-2 text-sm">Simulate signed success</button>
                  <button onClick={() => completeDevPay('failed')} className="flex-1 border-[1.5px] border-ink rounded-full py-2 text-sm">Fail</button>
                  <button onClick={() => completeDevPay('cancel')} className="flex-1 border-[1.5px] border-ink rounded-full py-2 text-sm">Cancel</button>
                </div>
              </>
            ) : (
              <div>
                <p className="text-sm text-ink-soft mb-3">Razorpay test checkout. The backend verifies the payment signature before marking the sale paid.</p>
                <button onClick={() => startRazorpay(payOrder)} className="w-full bg-ink text-paper rounded-full py-2 text-sm">
                  Pay with Razorpay
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Toast show={toast.show} message={toast.message} onClose={() => setToast({ show: false, message: '' })} />
    </div>
  )
}
