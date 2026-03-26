import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Truck,
  MessageCircle,
  Mail,
  Phone,
  Calculator,
  ExternalLink,
  Loader2,
  AlertCircle,
  Navigation,
  DollarSign
} from 'lucide-react';
import { useAuth } from '../src/contexts/AuthContext';
import { useLeadData } from '../src/hooks/useLeadData';
import {
  calculateDistanceBetweenCeps,
  generateGoogleMapsLink,
  generateWhatsAppLink,
  calculateFreightCost
} from '../services/logisticsService';

interface LogisticsSidebarProps {
  chatId: string;
  adPrice: number;
  adTitle: string;
}

const LogisticsSidebar: React.FC<LogisticsSidebarProps> = ({ chatId, adPrice, adTitle }) => {
  const { user } = useAuth();
  const { lead, isLoading: leadLoading } = useLeadData(chatId);
  
  const [distanceData, setDistanceData] = useState<{
    distanceKm: number;
    origin: string;
    destination: string;
  } | null>(null);
  
  const [pricePerKm, setPricePerKm] = useState<string>('3.50'); // Valor padrão
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);

  // Calcular distância quando CEPs estiverem disponíveis
  useEffect(() => {
    const calculateDistance = async () => {
      if (!user?.cep || !lead?.buyerCep) {
        return;
      }

      setIsCalculatingDistance(true);
      setDistanceError(null);

      try {
        const result = await calculateDistanceBetweenCeps(user.cep, lead.buyerCep);
        
        if (result) {
          setDistanceData({
            distanceKm: result.distanceKm,
            origin: `${result.origin.cidade}/${result.origin.uf}`,
            destination: `${result.destination.cidade}/${result.destination.uf}`
          });
        } else {
          setDistanceError('Não foi possível calcular a distância');
        }
      } catch (error) {
        setDistanceError('Erro ao calcular distância');
        console.error('Erro ao calcular distância:', error);
      } finally {
        setIsCalculatingDistance(false);
      }
    };

    calculateDistance();
  }, [user?.cep, lead?.buyerCep]);

  // Calcular frete
  const freightCost = distanceData && pricePerKm
    ? calculateFreightCost(distanceData.distanceKm, parseFloat(pricePerKm) || 0)
    : 0;

  const totalWithFreight = adPrice + freightCost;

  if (leadLoading) {
    return (
      <div className="w-80 border-l border-slate-200 bg-white p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
      </div>
    );
  }

  if (lead?.isLocked) {
    return (
      <motion.div
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-80 border-l border-slate-200 bg-gradient-to-b from-white to-slate-50 flex flex-col overflow-y-auto"
      >
        <div className="p-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-5 h-5 text-green-600" />
            <h3 className="font-bold text-slate-900">Inteligencia Logistica</h3>
          </div>
          <p className="text-xs text-slate-500">
            Dados para facilitar a negociacao
          </p>
        </div>

        <div className="flex-1 p-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Prazo de contato expirado</p>
                <p className="text-xs text-amber-700 mt-1">
                  Os dados do lead e os recursos de contato foram bloqueados porque a janela de acesso definida no plano terminou.
                </p>
                {lead.contactExpiresAt && (
                  <p className="text-xs text-amber-700 mt-2">
                    Bloqueado desde {new Date(lead.contactExpiresAt).toLocaleDateString('pt-BR')}.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="w-80 border-l border-slate-200 bg-gradient-to-b from-white to-slate-50 flex flex-col overflow-y-auto"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2 mb-1">
          <Truck className="w-5 h-5 text-green-600" />
          <h3 className="font-bold text-slate-900">Inteligência Logística</h3>
        </div>
        <p className="text-xs text-slate-500">
          Dados para facilitar a negociação
        </p>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Dados do Lead */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h4 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
            <Phone className="w-4 h-4 text-blue-600" />
            Dados do Comprador
          </h4>
          
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 font-medium">Nome</label>
              <p className="text-sm text-slate-900 font-medium">{lead?.buyerName || 'Não informado'}</p>
            </div>
            
            <div>
              <label className="text-xs text-slate-500 font-medium">E-mail</label>
              {lead?.buyerEmail ? (
                <a
                  href={`mailto:${lead.buyerEmail}`}
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1 group"
                >
                  <Mail className="w-3 h-3" />
                  {lead.buyerEmail}
                </a>
              ) : (
                <p className="text-sm text-slate-400 italic">Não informado</p>
              )}
            </div>
            
            <div>
              <label className="text-xs text-slate-500 font-medium">Telefone</label>
              <p className="text-sm text-slate-900 font-mono">
                {lead?.buyerPhone || <span className="text-slate-400 italic">Não informado</span>}
              </p>
            </div>

            <div>
              <label className="text-xs text-slate-500 font-medium">CEP</label>
              <p className="text-sm text-slate-900 font-mono">
                {lead?.buyerCep || <span className="text-slate-400 italic">CEP não informado</span>}
              </p>
            </div>
          </div>
        </div>

        {/* WhatsApp */}
        {lead?.buyerPhone ? (
          <motion.a
            href={generateWhatsAppLink(
              lead.buyerPhone,
              `Olá ${lead.buyerName}! Vi seu interesse no anúncio: ${adTitle}. Vamos conversar?`
            )}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="block w-full bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl p-4 shadow-lg hover:shadow-xl transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-sm">Chamar no WhatsApp</p>
                  <p className="text-xs text-green-100">Abrir conversa direta</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4" />
            </div>
          </motion.a>
        ) : (
          <div className="block w-full bg-slate-200 text-slate-500 rounded-xl p-4 opacity-60 cursor-not-allowed">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-sm">WhatsApp Indisponível</p>
                  <p className="text-xs">Telefone não informado</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mapa e Distância */}
        {user?.cep && lead?.buyerCep ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Mapa mockup */}
            <div className="relative h-32 bg-gradient-to-br from-blue-100 to-green-100">
              <div className="absolute inset-0 flex items-center justify-center">
                {isCalculatingDistance ? (
                  <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
                ) : distanceError ? (
                  <div className="text-center p-4">
                    <AlertCircle className="w-6 h-6 text-orange-500 mx-auto mb-2" />
                    <p className="text-xs text-slate-600">{distanceError}</p>
                  </div>
                ) : distanceData ? (
                  <div className="text-center">
                    <Navigation className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-slate-900">
                      {distanceData.distanceKm} km
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      {distanceData.origin} → {distanceData.destination}
                    </p>
                  </div>
                ) : null}
              </div>
              
              {/* Botão Ver no Maps */}
              {!isCalculatingDistance && distanceData && (
                <a
                  href={generateGoogleMapsLink(user.cep, lead.buyerCep)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-2 right-2 bg-white text-slate-700 text-xs px-3 py-1.5 rounded-lg shadow-md hover:shadow-lg transition-shadow flex items-center gap-1 font-medium"
                >
                  <MapPin className="w-3 h-3" />
                  Ver Rota
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-center py-4">
              <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 font-medium">Cálculo de Distância Indisponível</p>
              <p className="text-xs text-slate-400 mt-1">
                {!user?.cep && 'CEP do vendedor não cadastrado'}
                {user?.cep && !lead?.buyerCep && 'CEP do comprador não informado'}
              </p>
            </div>
          </div>
        )}

        {/* Calculadora de Frete */}
        {distanceData && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-purple-600" />
              Calculadora de Frete
            </h4>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">
                  Valor por Km (R$)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    value={pricePerKm}
                    onChange={(e) => setPricePerKm(e.target.value)}
                    step="0.10"
                    min="0"
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="3.50"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Média nacional: R$ 2,50 - R$ 5,00/km
                </p>
              </div>

              {/* Resumo do Cálculo */}
              <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Distância:</span>
                  <span className="font-bold text-slate-900">
                    {distanceData.distanceKm} km
                  </span>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Valor/km:</span>
                  <span className="font-bold text-slate-900">
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    }).format(parseFloat(pricePerKm) || 0)}
                  </span>
                </div>
                
                <div className="border-t border-slate-200 pt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 font-medium">Custo do Frete:</span>
                    <span className="font-bold text-green-600 text-lg">
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      }).format(freightCost)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total com Frete */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-3 border border-green-200">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Total (Produto + Frete)</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      }).format(totalWithFreight)}
                    </p>
                  </div>
                  <Truck className="w-8 h-8 text-green-600 opacity-50" />
                </div>
                
                <div className="mt-2 pt-2 border-t border-green-200">
                  <div className="text-xs text-slate-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Produto:</span>
                      <span className="font-medium">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(adPrice)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Frete:</span>
                      <span className="font-medium text-green-600">
                        +{new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(freightCost)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mensagem Inicial do Lead */}
        {lead?.initialMessage && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="font-bold text-sm text-slate-900 mb-2">Mensagem Inicial</h4>
            <p className="text-sm text-slate-600 italic">
              "{lead?.initialMessage}"
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Enviada em {new Date(lead?.createdAt || new Date()).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default LogisticsSidebar;
