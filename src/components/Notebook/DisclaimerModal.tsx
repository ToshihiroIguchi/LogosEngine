import React from 'react';
import { X, ShieldAlert } from 'lucide-react';

interface DisclaimerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                            <ShieldAlert size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-gray-800">Legal Information</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto text-sm text-gray-600 leading-relaxed space-y-6">
                    <section>
                        <h3 className="font-bold text-gray-800 mb-2">Disclaimer</h3>
                        <p className="mb-2">
                            This software is provided "AS IS" without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.
                        </p>
                        <p>
                            In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software (including but not limited to results of calculations).
                        </p>
                    </section>

                    <section>
                        <h3 className="font-bold text-gray-800 mb-2">Terms of Use</h3>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>
                                <strong>Legal Use:</strong> It is prohibited to use this software for any purpose that violates laws or public order (including malware creation, cyberattacks, or calculations for illegal transactions).
                            </li>
                            <li>
                                <strong>Platform Protection:</strong> It is prohibited to use this software for cryptocurrency mining or running scripts that place an excessive load on hosting servers.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="font-bold text-gray-800 mb-2">Critical Usage Warning</h3>
                        <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-red-800 text-xs font-medium">
                            Users use this software at their own risk. For critical applications such as structural calculations, chemical reaction predictions, or financial transactions, please ensure verification by experts before use.
                        </div>
                    </section>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-gray-200"
                    >
                        I Understand
                    </button>
                </div>
            </div>
        </div>
    );
};
